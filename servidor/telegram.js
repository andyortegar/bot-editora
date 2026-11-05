// Avisos a Verónica por Telegram.
import { fetchar } from './red.js';

async function api(config, metodo, datos) {
  if (!config.telegramToken) return null;
  const r = await fetchar(`https://api.telegram.org/bot${config.telegramToken}/${metodo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) throw new Error(`Telegram ${metodo}: ${d.description || r.status}`);
  return d.result;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const rd$ = (n) => `RD$${Math.round(n || 0).toLocaleString('en-US')}`;
const URG = { alta: '🔴 Urgencia alta', media: '🟡 Urgencia media', baja: '🟢 Urgencia baja' };
const ORIGEN = { instagram: 'Instagram', facebook: 'Facebook', web: 'página web', directo: 'directo', anuncio: 'anuncio' };
const esTel = (t) => /^\d+$/.test(String(t || ''));
// Cómo se muestra el cliente: su teléfono o, si usa nombre de usuario, un aviso de que no hay número.
const contacto = (t) => (esTel(t) ? `+${t}` : 'usuario sin número visible');
const ARTE = { si: 'Tiene diseño', parcial: 'Le falta algún diseño', no: 'No tiene diseño' };

export function textoAviso(chat, posicion) {
  const p = chat.pase;
  const items = p.items.length
    ? p.items.map((i) => `📦 ${esc(i.descripcion)} · ${i.precio == null ? 'cotización especial' : rd$(i.precio)}`).join('\n')
    : '📦 Sin productos todavía';
  return [
    `<b>🟢 Nuevo cliente · #${posicion} en la cola</b>`,
    `${esc(chat.nombre || 'Cliente')} · ${esc(contacto(chat.telefono))}`,
    items,
    `💰 ${p.ticketEstimado ? 'Ticket estimado' : 'Ticket'}: <b>${rd$(p.ticket)}</b>`,
    `📅 ${esc(p.fechaTexto || 'sin fecha')} · ${URG[p.urgencia] || 'Sin urgencia'}`,
    `🎨 ${ARTE[p.arte] || 'Diseño sin preguntar'}${p.quiereDiseno ? ' · quiere cotización de diseño' : ''} · Origen: ${ORIGEN[p.origen] || esc(p.origen)}`,
    `Motivo: ${esc(p.motivo)}`,
  ].join('\n');
}

const enlaceChat = (telefono) => `https://wa.me/${telefono}`;

export async function avisarPase(config, chat, posicion) {
  return api(config, 'sendMessage', {
    chat_id: config.telegramChat, parse_mode: 'HTML', text: textoAviso(chat, posicion),
    reply_markup: { inline_keyboard: [[
      ...(esTel(chat.telefono) ? [{ text: 'Abrir chat', url: enlaceChat(chat.telefono) }] : []),
      { text: 'Terminado', callback_data: `fin:${chat.telefono}` },
    ]] },
  });
}

export async function avisarComprobante(config, chat, c) {
  const texto = [
    `<b>💰 Comprobante de ${esc(chat.nombre || contacto(chat.telefono))}</b>`,
    `${c.monto ? rd$(c.monto) : 'Monto no legible'}${c.banco ? ` · ${esc(c.banco)}` : ''}${c.fecha ? ` · ${esc(c.fecha)}` : ''}${c.referencia_ultimos4 ? ` · ref. …${esc(c.referencia_ultimos4)}` : ''}`,
    `Ticket estimado: ${rd$(chat.pase?.ticket)}`,
    'Confírmelo en el banco antes de tocar Confirmar.',
  ].join('\n');
  return api(config, 'sendMessage', {
    chat_id: config.telegramChat, parse_mode: 'HTML', text: texto,
    reply_markup: { inline_keyboard: [[{ text: 'Confirmar', callback_data: `pago:${chat.telefono}:${c.monto || 0}` }, { text: 'No es pago', callback_data: `nopago:${chat.telefono}` }]] },
  });
}

export async function alerta(config, texto) {
  return api(config, 'sendMessage', { chat_id: config.telegramChat, parse_mode: 'HTML', text: `⚠️ ${texto}` });
}

// Minutos que lleva esperando un cliente, contando solo desde que abrió el negocio.
export function minutosEspera(pase, ahora, desdeApertura) {
  if (!pase?.fecha) return 0;
  const inicio = Math.max(new Date(pase.fecha).getTime(), desdeApertura ? desdeApertura(new Date(pase.fecha)).getTime() : 0);
  return Math.max(0, Math.round((ahora.getTime() - inicio) / 60000));
}

const espera = (min) => (min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`);

export function textoCola(almacen, ahora, desdeApertura) {
  const { cola, chats } = almacen.datos;
  const lineas = cola.length
    ? cola.map((t, i) => {
      const c = chats[t];
      return `${i + 1}. ${esc(c.nombre || contacto(t))} · ${rd$(c.pase?.ticket)} · ${URG[c.pase?.urgencia]?.slice(0, 2) || '⚪'} · ${espera(minutosEspera(c.pase, ahora, desdeApertura))}`;
    })
    : ['Nadie en espera. 🎉'];
  return `<b>📋 Cola de atención</b> (${cola.length})\n${lineas.join('\n')}`;
}

// Mensaje fijado con la cola en el chat de Verónica y en el de cada supervisor; se edita cada vez que cambia.
export async function actualizarCola(config, almacen, ahora = new Date(), desdeApertura = null) {
  if (!config.telegramToken) return;
  const texto = textoCola(almacen, ahora, desdeApertura);
  const colas = almacen.datos.telegram.colas;
  for (const chatId of [config.telegramChat, ...config.telegramSupervisores].filter(Boolean)) {
    try {
      if (colas[chatId]) {
        await api(config, 'editMessageText', { chat_id: chatId, message_id: colas[chatId], parse_mode: 'HTML', text: texto });
        continue;
      }
    } catch (e) {
      if (/not modified/i.test(e.message)) continue;
    }
    const m = await api(config, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: texto });
    colas[chatId] = m.message_id;
    await api(config, 'pinChatMessage', { chat_id: chatId, message_id: m.message_id, disable_notification: true }).catch(() => {});
  }
}

// Aviso solo para los supervisores (seguimiento de la atención).
export async function alertaSupervisor(config, texto) {
  for (const chatId of config.telegramSupervisores) {
    await api(config, 'sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `👀 ${texto}` });
  }
}

export async function responderBoton(config, callbackId, texto) {
  return api(config, 'answerCallbackQuery', { callback_query_id: callbackId, text: texto });
}

export async function quitarBotones(config, chatId, mensajeId, textoNuevo) {
  return api(config, 'editMessageReplyMarkup', { chat_id: chatId, message_id: mensajeId, reply_markup: { inline_keyboard: [] } })
    .then(() => textoNuevo && api(config, 'sendMessage', { chat_id: chatId, text: textoNuevo, reply_to_message_id: mensajeId }));
}
