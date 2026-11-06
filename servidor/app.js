// Lógica del servidor: une WhatsApp (360dialog), el motor, la IA, Telegram y el almacén.
import { procesar } from '../src/motor.js';
import { intencion } from '../src/interpretar.js';
import { abierto, proximaApertura } from '../src/tiempo.js';
import { aWhatsApp, enviar, descargarMedia, leerWebhook } from './whatsapp.js';
import { entender, textoCanonico, leerComprobante } from './ia.js';
import { ordenarCola } from './cola.js';
import * as tg from './telegram.js';

export function crearApp({ config, almacen, reloj = () => new Date(), log = console }) {
  const d = almacen.datos;
  const filas = new Map(); // un chat a la vez por teléfono, para no mezclar mensajes seguidos

  const enOrden = (telefono, tarea) => {
    const previa = filas.get(telefono) || Promise.resolve();
    const siguiente = previa.then(tarea).catch((e) => log.error(`[${telefono}]`, e));
    filas.set(telefono, siguiente);
    return siguiente;
  };

  const falloEntender = (previo, r) =>
    r.estado.noEntendido > (previo?.noEntendido || 0) || r.eventos.some((e) => e.motivo === 'no se entendió');

  async function mandar(chat, mensajes) {
    for (const m of mensajes) {
      try {
        await enviar(config, aWhatsApp(chat.telefono, m));
        chat.historial.push({ de: 'bot', fecha: reloj().toISOString(), texto: m.texto || m.tipo });
      } catch (e) {
        log.error('Fallo al enviar', e.message);
        const causa = e.status === 429
          ? 'WhatsApp frenó los envíos a este cliente por mandar muchos mensajes seguidos; se reintentó 3 veces. Escríbale desde la app.'
          : 'Revise el saldo de 360dialog.';
        await tg.alerta(config, `No pude enviarle un mensaje a ${chat.telefono}. ${causa} Detalle: ${e.message}`).catch(() => {});
        break;
      }
    }
  }

  async function reordenarYAvisar() {
    d.cola = ordenarCola(d.cola, d.chats, config.margenEmpate);
    await tg.actualizarCola(config, almacen, reloj(), proximaApertura).catch((e) => log.error('Cola en Telegram', e.message));
  }

  async function alPasar(chat, ev) {
    chat.pase = { ...ev, fecha: reloj().toISOString() };
    chat.alertaEspera = false;
    chat.resultado = { estado: 'en atención', fecha: reloj().toISOString() };
    if (!d.cola.includes(chat.telefono)) d.cola.push(chat.telefono);
    d.cola = ordenarCola(d.cola, d.chats, config.margenEmpate);
    almacen.registrar({ tipo: 'pase', telefono: chat.telefono, motivo: ev.motivo, ticket: ev.ticket, origen: ev.origen });
    await tg.avisarPase(config, chat, d.cola.indexOf(chat.telefono) + 1).catch((e) => log.error('Aviso Telegram', e.message));
    await tg.actualizarCola(config, almacen, reloj(), proximaApertura).catch((e) => log.error('Cola en Telegram', e.message));
  }

  async function alArchivo(chat, mediaId) {
    if (!mediaId || !config.anthropicClave) return;
    const archivo = await descargarMedia(config, mediaId);
    if (!archivo) return;
    const c = await leerComprobante(config, archivo).catch((e) => { log.error('IA comprobante', e.message); return null; });
    if (!c?.es_comprobante) return;
    chat.comprobantes = [...(chat.comprobantes || []), { ...c, fecha: reloj().toISOString(), estado: 'por confirmar' }];
    chat.resultado = { ...(chat.resultado || {}), estado: 'pago por confirmar', monto: c.monto || null };
    almacen.registrar({ tipo: 'comprobante', telefono: chat.telefono, monto: c.monto || null });
    await tg.avisarComprobante(config, chat, c).catch((e) => log.error('Aviso comprobante', e.message));
  }

  async function mensaje(s) {
    const ahora = reloj();
    const chat = almacen.chat(s.telefono);
    if (s.nombre) chat.nombre = s.nombre;
    chat.historial.push({ de: 'cliente', fecha: ahora.toISOString(), texto: s.entrada.texto || s.entrada.id || s.entrada.tipo });
    if (chat.historial.length > 200) chat.historial.splice(0, chat.historial.length - 200);

    const previo = chat.estado;
    let r = procesar(previo, s.entrada, ahora);

    // Si las reglas no entendieron el texto, se le pregunta a la IA (máximo N veces por chat).
    if (s.entrada.tipo === 'texto' && config.anthropicClave && (chat.usosIA || 0) < config.maxUsosIA && falloEntender(previo, r)) {
      chat.usosIA = (chat.usosIA || 0) + 1;
      try {
        const canon = textoCanonico(await entender(config, s.entrada.texto, previo?.etapa || 'nuevo'));
        if (canon) {
          const r2 = procesar(previo, { tipo: 'texto', texto: canon }, ahora);
          if (!falloEntender(previo, r2)) {
            const origen = intencion(s.entrada.texto).origen;
            if (origen) r2.estado.origen = origen;
            r = r2;
          }
        }
      } catch (e) { log.error('IA texto', e.message); }
    }

    // Si el chat llegó por un anuncio, el origen queda como "anuncio" (salvo que diga Instagram, Facebook o web).
    if (s.anuncio && (!r.estado.origen || r.estado.origen === 'directo')) {
      r.estado.origen = 'anuncio';
      for (const ev of r.eventos) if (ev.tipo === 'pase' && ev.origen === 'directo') ev.origen = 'anuncio';
    }

    if (!previo || previo.etapa === 'nuevo') almacen.registrar({ tipo: 'chat_nuevo', telefono: s.telefono, origen: r.estado.origen });
    if (r.estado.etapa === 'curioso' && previo?.etapa !== 'curioso') almacen.registrar({ tipo: 'curioso', telefono: s.telefono });
    chat.estado = r.estado;

    await mandar(chat, r.mensajes);
    for (const ev of r.eventos) {
      if (ev.tipo === 'pase') await alPasar(chat, ev);
      if (ev.tipo === 'archivo') await alArchivo(chat, s.mediaId);
    }
    almacen.guardar();
  }

  // Verónica le escribió al cliente desde la app (coexistencia): sale de la cola y el bot se calla.
  async function eco(s) {
    const chat = almacen.chat(s.telefono);
    chat.atendido = reloj().toISOString();
    if (chat.estado && chat.estado.etapa !== 'pasado') chat.estado = { ...chat.estado, etapa: 'pasado' };
    if (d.cola.includes(s.telefono)) {
      d.cola = d.cola.filter((t) => t !== s.telefono);
      almacen.registrar({ tipo: 'atendido', telefono: s.telefono });
      await reordenarYAvisar();
    }
    almacen.guardar();
  }

  async function estado(s) {
    if (s.estado === 'failed') {
      almacen.registrar({ tipo: 'envio_fallido', telefono: s.telefono, error: s.error });
      await tg.alerta(config, `Un mensaje a +${s.telefono} no se entregó: ${s.error || 'error desconocido'}. Si se repite, revise el saldo de 360dialog.`).catch(() => {});
      almacen.guardar();
    }
  }

  async function calidad(s) {
    d.calidad.push({ fecha: reloj().toISOString(), evento: s.evento, calidad: s.calidad });
    if (/FLAGGED|DOWNGRADE/i.test(s.evento || '')) {
      await tg.alerta(config, `La calidad del número bajó (${s.evento}). Revise en 360dialog qué clientes bloquearon o denunciaron.`).catch(() => {});
    }
    almacen.guardar();
  }

  return {
    // Webhook de 360dialog
    async whatsapp(cuerpo) {
      const tareas = [];
      for (const s of leerWebhook(cuerpo)) {
        if (s.tipo === 'mensaje') tareas.push(enOrden(s.telefono, () => mensaje(s)));
        if (s.tipo === 'eco') tareas.push(enOrden(s.telefono, () => eco(s)));
        if (s.tipo === 'estado') tareas.push(estado(s));
        if (s.tipo === 'calidad') tareas.push(calidad(s));
      }
      await Promise.all(tareas);
    },

    // Botones de los avisos de Telegram
    async telegram(update) {
      const cb = update.callback_query;
      if (!cb?.data) return;
      const [accion, telefono, monto] = cb.data.split(':');
      const chat = d.chats[telefono];
      if (!chat) return tg.responderBoton(config, cb.id, 'Ese cliente ya no está.').catch(() => {});
      const mensajeId = cb.message?.message_id, chatId = cb.message?.chat?.id;
      if (accion === 'fin') {
        d.cola = d.cola.filter((t) => t !== telefono);
        chat.atendido = chat.atendido || reloj().toISOString();
        almacen.registrar({ tipo: 'terminado', telefono });
        await tg.responderBoton(config, cb.id, 'Listo, salió de la cola.').catch(() => {});
        await tg.quitarBotones(config, chatId, mensajeId, null).catch(() => {});
        await reordenarYAvisar();
      }
      if (accion === 'pago') {
        const m = Number(monto) || null;
        chat.resultado = { estado: 'vendido', monto: m, fecha: reloj().toISOString(), porComprobante: true };
        const ult = chat.comprobantes?.at(-1); if (ult) ult.estado = 'confirmado';
        almacen.registrar({ tipo: 'pago_confirmado', telefono, monto: m });
        await tg.responderBoton(config, cb.id, 'Pago confirmado. Queda como vendido.').catch(() => {});
        await tg.quitarBotones(config, chatId, mensajeId, '✅ Pago confirmado').catch(() => {});
      }
      if (accion === 'nopago') {
        const ult = chat.comprobantes?.at(-1); if (ult) ult.estado = 'no es pago';
        if (chat.resultado?.estado === 'pago por confirmar') chat.resultado = { ...chat.resultado, estado: 'en atención', monto: null };
        await tg.responderBoton(config, cb.id, 'Anotado: no era un pago.').catch(() => {});
        await tg.quitarBotones(config, chatId, mensajeId, null).catch(() => {});
      }
      almacen.guardar();
    },

    // Panel: marcar el resultado de un cliente
    marcarResultado(telefono, estadoResultado, montoTexto, motivo) {
      const chat = d.chats[telefono];
      if (!chat) return false;
      const monto = Number(String(montoTexto || '').replace(/[^\d.]/g, '')) || null;
      chat.resultado = { estado: estadoResultado, monto, motivo: motivo || null, fecha: reloj().toISOString() };
      almacen.registrar({ tipo: `resultado_${estadoResultado}`, telefono, monto });
      if (['vendido', 'no compró'].includes(estadoResultado)) d.cola = d.cola.filter((t) => t !== telefono);
      almacen.guardar();
      return true;
    },
    // Se llama cada pocos minutos: refresca los tiempos de la cola y avisa al dueño si alguien espera demasiado.
    async revisarEsperas() {
      if (!d.cola.length) return;
      const ahora = reloj();
      await tg.actualizarCola(config, almacen, ahora, proximaApertura).catch((e) => log.error('Cola en Telegram', e.message));
      if (!abierto(ahora) || !config.telegramSupervisores.length) return almacen.guardar();
      for (const [i, t] of d.cola.entries()) {
        const chat = d.chats[t];
        const min = tg.minutosEspera(chat.pase, ahora, proximaApertura);
        if (min >= config.alertaEsperaMin && !chat.alertaEspera) {
          chat.alertaEspera = true;
          await tg.alertaSupervisor(config, `<b>${chat.nombre || `+${t}`}</b> lleva ${min} min esperando a Verónica (#${i + 1} en la cola, ticket RD$${Math.round(chat.pase?.ticket || 0).toLocaleString('en-US')}).`).catch((e) => log.error('Alerta supervisor', e.message));
        }
      }
      almacen.guardar();
    },
    terminar: async (telefono) => {
      d.cola = d.cola.filter((t) => t !== telefono);
      almacen.registrar({ tipo: 'terminado', telefono });
      await reordenarYAvisar();
      almacen.guardar();
    },
  };
}
