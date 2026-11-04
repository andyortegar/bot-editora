// Motor de conversación del bot de Editora Ortega.
// Es "puro": no usa red ni base de datos. Recibe el estado del chat y el mensaje del cliente,
// y devuelve el estado nuevo, los mensajes a enviar y los eventos (avisos a Verónica).
import { NEGOCIO, CATALOGO, OTRO_PRODUCTO, OFERTAS, TEXTO_HORARIO } from './config.js';
import { cotizar } from './cotizar.js';
import { abierto, cuandoAbre, feriado, interpretarFecha, textoFecha } from './tiempo.js';
import { intencion, pedidosDe, cantidadDe, variantesDe, norm } from './interpretar.js';

// --- Mensajes ---------------------------------------------------------------------
const texto = (t) => ({ tipo: 'texto', texto: t });
const botones = (t, bs) => ({ tipo: 'botones', texto: t, botones: bs.map(([id, titulo]) => ({ id, titulo })) });
const lista = (t, boton, filas) => ({ tipo: 'lista', texto: t, boton, filas: filas.map(([id, titulo]) => ({ id, titulo })) });

const rd$ = (n) => `RD$${Math.round(n).toLocaleString('en-US')}`;
const unit$ = (n) => `RD$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const prod = (id) => CATALOGO.find((p) => p.id === id);
const SINGULAR = { banner_arana: 'banner araña', roll_up: 'roll up' };

function descripcion(item) {
  if (item.producto === 'otro') return item.descripcion;
  const p = prod(item.producto);
  const unidad = item.cantidad === 1 && SINGULAR[p.id] ? SINGULAR[p.id] : p.unidad;
  const partes = [item.cantidad.toLocaleString('en-US'), unidad];
  if (p.varianteUnica) partes.push(p.texto);
  for (const paso of p.pasos) {
    const op = paso.opciones.find((o) => o.id === item[paso.campo]);
    if (op) partes.push(paso.campo === 'doblez' ? `(${op.texto})` : op.texto);
  }
  return partes.join(' ');
}

const listaProductos = (t) =>
  lista(t, 'Ver productos', [...CATALOGO.map((p) => [p.id, p.lista]), [OTRO_PRODUCTO.id, OTRO_PRODUCTO.lista]]);

const SALUDO = `¡Hola! 👋 Gracias por escribir a *${NEGOCIO.nombre}*. Soy el asistente virtual y le ayudo a cotizar en segundos.`;

function menu(saludo = SALUDO) {
  if (OFERTAS.length) return [botones(`${saludo}\n¿En qué le puedo ayudar?`, [['ofertas', 'Ver ofertas'], ['cotizar', 'Cotizar producto']])];
  return [listaProductos(`${saludo}\n¿Qué producto le interesa?`)];
}

function botonesCotizacion(e) {
  const bs = [['pedido', 'Quiero hacer pedido']];
  if (e.carrito.length < NEGOCIO.maxProductos) bs.push(['cotizar_otro', 'Cotizar otro']);
  bs.push(['solo', 'Solo preguntaba']);
  return bs;
}

function resumen(e) {
  const lineas = e.carrito.map((i) => `• ${descripcion(i)}: ${i.precio == null ? 'cotización especial' : rd$(i.precio)}`);
  const total = e.carrito.reduce((s, i) => s + (i.precio || 0), 0);
  const especial = e.carrito.some((i) => i.precio == null);
  return `Su cotización:\n${lineas.join('\n')}\n*Total de referencia: ${rd$(total)}*${especial ? ' (sin contar la cotización especial)' : ''}`;
}

// --- Estado -----------------------------------------------------------------------
export function estadoNuevo() {
  return {
    etapa: 'nuevo', carrito: [], actual: null, cola: [], sugerencia: null,
    fecha: null, fechaTexto: null, urgencia: null, arte: null, quiereDiseno: false,
    origen: 'directo', notasVoz: 0, noEntendido: 0, pidioPersona: false, archivos: 0,
    motivo: null, ultimo: null,
  };
}

// Pregunta pendiente de la etapa actual (para repetirla después de una interrupción).
function repreguntar(e) {
  switch (e.etapa) {
    case 'producto': return [listaProductos('¿Qué producto le interesa?')];
    case 'paso': return preguntaPaso(e);
    case 'cantidad': return [texto('¿Qué cantidad necesita?')];
    case 'cotizado': return [botones('¿Cómo desea seguir?', botonesCotizacion(e))];
    case 'otro_desc': return [texto('Descríbame el producto que necesita (tipo, tamaño y cantidad).')];
    case 'fecha': return [texto('¿Para qué fecha lo necesita?')];
    case 'arte': return [preguntaArte()];
    case 'diseno': return [preguntaDiseno()];
    default: return [];
  }
}

const preguntaArte = () =>
  botones('¿Ya tiene el diseño listo para imprimir?', [['arte_si', 'Sí, de todo'], ['arte_parcial', 'Me falta alguno'], ['arte_no', 'No tengo diseño']]);
const preguntaDiseno = () =>
  botones('Nuestros precios no incluyen el diseño. ¿Desea que se le cotice incluyendo el mismo?', [['diseno_si', 'Sí, con diseño'], ['diseno_no', 'No, gracias']]);

// --- Productos --------------------------------------------------------------------
function preguntaPaso(e) {
  const p = prod(e.actual.producto);
  const paso = p.pasos.find((x) => !e.actual[x.campo]);
  if (p.id === 'talonarios') {
    const v = (id) => cotizar('talonarios', id, 18).ofertas[0][1];
    return [botones(
      `Los talonarios son de *50 juegos* (original + 1 copia), tamaño media carta. El pedido mínimo es de *18 talonarios*:\n• A un color: *${rd$(v('1color'))}*\n• Full color: *${rd$(v('fullcolor'))}*\nSi necesita más de 18, ${NEGOCIO.colaboradora} le cotiza.`,
      paso.opciones.map((o) => [o.id, o.boton]),
    )];
  }
  return [botones(conInfo(e, paso.pregunta), paso.opciones.map((o) => [o.id, o.boton]))];
}

// La primera pregunta de cada producto lleva su información completa (tamaño, material, mínimo).
function conInfo(e, pregunta) {
  const p = prod(e.actual.producto);
  if (!p.info || e.actual.infoMostrada) return pregunta;
  e.actual.infoMostrada = true;
  return `${p.info}\n\n${pregunta}`;
}

// Sigue con el producto actual: pide lo que falte o lo cotiza.
function avanzar(e, ahora, salida) {
  const p = prod(e.actual.producto);
  if (p.varianteUnica) e.actual.variante = p.varianteUnica;
  if (p.pasos.some((x) => !e.actual[x.campo])) {
    e.etapa = 'paso';
    salida.push(...preguntaPaso(e));
    return;
  }
  if (!e.actual.cantidad && p.cantidadFija) e.actual.cantidad = p.cantidadFija;
  if (!e.actual.cantidad) {
    e.etapa = 'cantidad';
    salida.push(texto(conInfo(e, '¿Qué cantidad necesita?')));
    return;
  }
  cotizarActual(e, ahora, salida);
}

function cotizarActual(e, ahora, salida) {
  const a = e.actual;
  const r = cotizar(a.producto, a.variante, a.cantidad);
  if (r.pasar) {
    e.carrito.push({ producto: a.producto, variante: a.variante, doblez: a.doblez, cantidad: a.cantidad, precio: null, especial: true });
    e.actual = null;
    salida.push(texto(`Para ${a.cantidad.toLocaleString('en-US')} ${prod(a.producto).unidad} le preparamos una cotización especial. ${NEGOCIO.colaboradora} se la envía por aquí.`));
    e.motivo = e.motivo || 'cotización especial';
    if (e.cola.length) return siguienteDeCola(e, ahora, salida);
    return iniciarPedido(e, salida);
  }
  const [cant, precio] = r.ofertas[0];
  const { infoMostrada, ...resto } = a;
  const item = { ...resto, cantidad: cant, precio };
  e.carrito.push(item);
  e.actual = null;
  const lineas = [];
  if (r.nota?.startsWith('minimo:')) lineas.push(`El pedido mínimo es de ${cant.toLocaleString('en-US')} ${prod(item.producto).unidad}.`);
  if (r.nota === 'paquetes') lineas.push('Trabajamos por paquetes:');
  lineas.push(`*${descripcion(item)}: ${rd$(precio)}*`);
  e.sugerencia = null;
  if (r.ofertas[1]) {
    const [c2, p2] = r.ofertas[1];
    lineas.push(`💡 Si lleva *${c2.toLocaleString('en-US')}*, le salen en *${rd$(p2)}* (${unit$(p2 / c2)} c/u en vez de ${unit$(precio / cant)}).`);
    e.sugerencia = c2;
  }
  if (e.cola.length) {
    salida.push(texto(lineas.join('\n')));
    return siguienteDeCola(e, ahora, salida);
  }
  mostrarCotizacion(e, lineas, salida);
}

function mostrarCotizacion(e, lineas, salida) {
  e.etapa = 'cotizado';
  if (e.carrito.length > 1) {
    if (lineas.length) salida.push(texto(lineas.join('\n')));
    salida.push(botones(resumen(e), botonesCotizacion(e)));
  } else {
    salida.push(botones(lineas.join('\n'), botonesCotizacion(e)));
  }
}

function siguienteDeCola(e, ahora, salida) {
  e.actual = e.cola.shift();
  avanzar(e, ahora, salida);
}

function empezarProductos(e, pedidos, ahora, salida) {
  const espacio = NEGOCIO.maxProductos - e.carrito.length;
  const tomar = pedidos.slice(0, Math.max(espacio, 0));
  if (!tomar.length) {
    salida.push(texto(`Puede cotizar hasta ${NEGOCIO.maxProductos} productos a la vez. Si necesita más, ${NEGOCIO.colaboradora} le ayuda con gusto.`));
    return;
  }
  e.cola = tomar.slice(1);
  e.actual = tomar[0];
  avanzar(e, ahora, salida);
}

// Cambia la cantidad del último producto cotizado (por ejemplo, acepta la sugerencia).
function cambiarCantidad(e, cantidad, ahora, salida) {
  const ultimo = e.carrito.pop();
  if (ultimo.producto === 'otro') { e.carrito.push(ultimo); return false; }
  e.actual = { producto: ultimo.producto, variante: ultimo.variante, doblez: ultimo.doblez, cantidad };
  cotizarActual(e, ahora, salida);
  return true;
}

// --- Pedido y pase a Verónica -------------------------------------------------------
function iniciarPedido(e, salida) {
  e.etapa = 'fecha';
  salida.push(texto('¿Para qué fecha lo necesita?'));
}

function pasar(e, ahora, motivo, salida, eventos, { mensaje = true } = {}) {
  e.motivo = motivo || e.motivo || 'quiere hacer pedido';
  e.etapa = 'pasado';
  const sinPrecio = e.carrito.filter((i) => i.precio == null).length;
  const conPrecio = e.carrito.reduce((s, i) => s + (i.precio || 0), 0);
  const ticket = conPrecio + sinPrecio * NEGOCIO.ticketPromedio || NEGOCIO.ticketPromedio;
  eventos.push({
    tipo: 'pase', motivo: e.motivo, ticket, ticketEstimado: sinPrecio > 0 || e.carrito.length === 0,
    items: e.carrito.map((i) => ({ descripcion: descripcion(i), precio: i.precio })),
    fecha: e.fecha, fechaTexto: e.fechaTexto, urgencia: e.urgencia,
    arte: e.arte, quiereDiseno: e.quiereDiseno, origen: e.origen,
  });
  if (!mensaje) return;
  if (abierto(ahora)) {
    salida.push(texto(`¡Perfecto! Ya le pasé sus datos a *${NEGOCIO.colaboradora}*, quien le atenderá por aquí en breve. 🙌`));
  } else {
    salida.push(texto(`¡Perfecto! Ya le pasé sus datos a *${NEGOCIO.colaboradora}*. Nuestro horario es ${TEXTO_HORARIO} Le escribirá *${cuandoAbre(ahora)}* 🙌`));
  }
}

function terminarPedido(e, ahora, salida, eventos) {
  if (e.arte === 'si') return pasar(e, ahora, null, salida, eventos);
  e.etapa = 'diseno';
  salida.push(preguntaDiseno());
}

// --- Respuestas generales -----------------------------------------------------------
function ubicacion() {
  return [
    { tipo: 'ubicacion', lat: NEGOCIO.ubicacion.lat, lng: NEGOCIO.ubicacion.lng, nombre: NEGOCIO.nombre, direccion: NEGOCIO.direccion },
    texto(`📍 *${NEGOCIO.nombre}*\n${NEGOCIO.direccion}\n\nNuestro horario es ${TEXTO_HORARIO}`),
  ];
}

function horario(ahora) {
  const f = feriado(ahora);
  if (f) return texto(`Hoy estamos cerrados por ${f.replace(/ \(.*\)$/, '')}. Nuestro horario es ${TEXTO_HORARIO}`);
  return texto(`Nuestro horario es ${TEXTO_HORARIO}${abierto(ahora) ? ' Ahora mismo estamos abiertos. 😊' : ''}`);
}

function noEntendido(e, ahora, salida, eventos) {
  e.noEntendido += 1;
  if (e.noEntendido >= NEGOCIO.maxNoEntendido) return pasar(e, ahora, 'no se entendió', salida, eventos);
  if (e.etapa === 'cantidad') return salida.push(texto('Disculpe, no le entendí bien. Escriba la cantidad en números, por ejemplo: 500.'));
  salida.push(texto('Disculpe, no le entendí bien.'));
  const rep = repreguntar(e);
  salida.push(...(rep.length ? rep : [listaProductos('¿Qué producto le interesa?')]));
}

function pidePersona(e, ahora, salida, eventos) {
  if (e.pidioPersona) return pasar(e, ahora, 'pidió persona', salida, eventos);
  e.pidioPersona = true;
  e.etapa = 'producto';
  salida.push(listaProductos(`Con gusto. Para que ${NEGOCIO.colaboradora} le atienda más rápido, ¿qué producto le interesa?`));
}

// --- Entrada principal --------------------------------------------------------------
// entrada: { tipo: 'texto'|'boton'|'lista'|'audio'|'imagen'|'documento', texto?, id? }
export function procesar(estadoPrevio, entrada, ahora = new Date()) {
  let e = estadoPrevio ? structuredClone(estadoPrevio) : estadoNuevo();
  if (e.ultimo && (ahora - new Date(e.ultimo)) / 86400000 >= NEGOCIO.diasReinicio) e = estadoNuevo();
  e.ultimo = ahora.toISOString();
  const salida = [], eventos = [];
  const fin = () => ({ estado: e, mensajes: salida, eventos });

  // Ya lo atiende Verónica: el bot se queda callado; solo avisa si llega un archivo (posible comprobante).
  if (e.etapa === 'pasado') {
    if (entrada.tipo === 'imagen' || entrada.tipo === 'documento') eventos.push({ tipo: 'archivo', archivo: entrada.tipo });
    return fin();
  }

  if (entrada.tipo === 'audio') {
    e.notasVoz += 1;
    if (e.notasVoz >= 2) pasar(e, ahora, 'nota de voz', salida, eventos);
    else salida.push(texto('Disculpe, por el momento no puedo escuchar notas de voz. ¿Me lo podría escribir, por favor?'));
    return fin();
  }

  if (entrada.tipo === 'imagen' || entrada.tipo === 'documento') {
    e.archivos += 1;
    if (e.etapa === 'arte') {
      e.arte = 'si';
      salida.push(texto('¡Gracias! Recibí su diseño. 🎨'));
      pasar(e, ahora, null, salida, eventos);
      return fin();
    }
    salida.push(texto(`¡Recibido! ${NEGOCIO.colaboradora} lo verá cuando le pase su pedido.`));
    salida.push(...repreguntar(e));
    return fin();
  }

  const id = entrada.id || null;
  const t = entrada.texto || '';
  const it = intencion(t);
  if (it.origen) e.origen = it.origen;

  // --- Botones y listas ---
  if (id) {
    const p = CATALOGO.find((x) => x.id === id);
    if (p && ['producto', 'nuevo', 'curioso', 'cotizado'].includes(e.etapa)) {
      empezarProductos(e, [{ producto: p.id }], ahora, salida);
      return fin();
    }
    if (id === OTRO_PRODUCTO.id) {
      e.etapa = 'otro_desc';
      salida.push(texto('Descríbame el producto que necesita (tipo, tamaño y cantidad).'));
      return fin();
    }
    if (e.etapa === 'paso') {
      const paso = prod(e.actual.producto).pasos.find((x) => !e.actual[x.campo]);
      if (paso?.opciones.some((o) => o.id === id)) {
        e.actual[paso.campo] = id;
        avanzar(e, ahora, salida);
        return fin();
      }
    }
    if (e.etapa === 'cotizado') {
      if (id === 'pedido') { iniciarPedido(e, salida); return fin(); }
      if (id === 'cotizar_otro') { e.etapa = 'producto'; salida.push(listaProductos('¿Qué otro producto le interesa?')); return fin(); }
      if (id === 'solo') {
        e.etapa = 'curioso';
        salida.push(texto('¡Con gusto! 😊 Cuando esté listo, escríbanos por aquí y le atendemos.'));
        return fin();
      }
    }
    if (e.etapa === 'arte' && id.startsWith('arte_')) {
      e.arte = { arte_si: 'si', arte_parcial: 'parcial', arte_no: 'no' }[id];
      terminarPedido(e, ahora, salida, eventos);
      return fin();
    }
    if (e.etapa === 'diseno' && id.startsWith('diseno_')) {
      e.quiereDiseno = id === 'diseno_si';
      pasar(e, ahora, null, salida, eventos);
      return fin();
    }
    if (id === 'cotizar') { e.etapa = 'producto'; salida.push(listaProductos('¿Qué producto le interesa?')); return fin(); }
    // Botón viejo de un mensaje anterior: se repite la pregunta actual.
    salida.push(...repreguntar(e));
    return fin();
  }

  // --- Texto libre ---
  // Preguntas generales: se contestan y luego se repite la pregunta pendiente.
  const generales = [];
  if (it.ubicacion) generales.push(...ubicacion());
  if (it.horario && !it.ubicacion) generales.push(horario(ahora));
  if (it.llamar) generales.push(texto('Este número no recibe llamadas, pero con gusto le atendemos por aquí mismo. 😊'));
  if (it.itbis) generales.push(texto('Nuestros precios no incluyen ITBIS.'));

  const pedidos = pedidosDe(t);

  if (it.persona && !pedidos.length && !generales.length) {
    pidePersona(e, ahora, salida, eventos);
    return fin();
  }

  if (['nuevo', 'curioso'].includes(e.etapa)) {
    const saludo = e.etapa === 'curioso' ? `¡Hola de nuevo! 👋` : SALUDO;
    if (e.etapa === 'curioso') { e.carrito = []; e.motivo = null; }
    if (pedidos.length) {
      salida.push(...generales);
      if (e.etapa === 'nuevo' || it.saludo) salida.push(texto(saludo));
      empezarProductos(e, pedidos, ahora, salida);
      return fin();
    }
    if (it.ofertas && !OFERTAS.length) generales.push(texto('Por el momento no tenemos ofertas activas, pero con gusto le cotizo.'));
    salida.push(...generales);
    e.etapa = 'producto';
    salida.push(...(generales.length ? [listaProductos('¿Le puedo ayudar con una cotización? ¿Qué producto le interesa?')] : menu(saludo)));
    return fin();
  }

  if (generales.length) {
    salida.push(...generales, ...repreguntar(e));
    return fin();
  }

  switch (e.etapa) {
    case 'producto': {
      if (pedidos.length) { empezarProductos(e, pedidos, ahora, salida); return fin(); }
      if (e.pidioPersona && !it.gracias) { pasar(e, ahora, 'pidió persona', salida, eventos); return fin(); }
      break;
    }
    case 'paso': {
      const p = prod(e.actual.producto);
      const otro = pedidos.find((x) => x.producto !== p.id);
      if (otro) { e.actual = null; empezarProductos(e, pedidos, ahora, salida); return fin(); }
      const paso = p.pasos.find((x) => !e.actual[x.campo]);
      const v = variantesDe(p.id, t);
      const cant = cantidadDe(t);
      const elegido = v[paso.campo] || paso.opciones.find((o) => norm(t) === norm(o.boton) || norm(t) === norm(o.texto))?.id;
      if (cant && !e.actual.cantidad) e.actual.cantidad = cant;
      if (elegido) { Object.assign(e.actual, v, { [paso.campo]: elegido }); avanzar(e, ahora, salida); return fin(); }
      break;
    }
    case 'cantidad': {
      const otro = pedidos.find((x) => x.producto !== e.actual.producto);
      if (otro) { e.actual = null; empezarProductos(e, pedidos, ahora, salida); return fin(); }
      const cant = cantidadDe(t);
      if (cant) { e.actual.cantidad = cant; avanzar(e, ahora, salida); return fin(); }
      break;
    }
    case 'cotizado': {
      const nt = norm(t);
      if (/\b(quiero hacer (el )?pedido|hacer (el )?pedido|lo quiero|los quiero|las quiero|quiero ordenar|vamos a hacerlo|me interesa|lo hacemos)\b/.test(nt)) { iniciarPedido(e, salida); return fin(); }
      const quitar = /\b(quite|quita|quitar|elimine|elimina|eliminar|sin los|sin las|borra|borre)\b/.test(nt);
      if (quitar && pedidos.length) {
        const antes = e.carrito.length;
        e.carrito = e.carrito.filter((i) => !pedidos.some((x) => x.producto === i.producto));
        if (e.carrito.length < antes) {
          if (!e.carrito.length) { e.etapa = 'producto'; salida.push(listaProductos('Listo, lo quité. ¿Qué producto le interesa?')); return fin(); }
          salida.push(texto('Listo, lo quité.'));
          mostrarCotizacion(e, [], salida);
          return fin();
        }
      }
      if (pedidos.length) {
        // "mejor 1000 tarjetas": si el producto ya está en la cotización, se cambia la cantidad.
        const cambio = /\b(mejor|cambia|cambie|cambiar|en vez|que sean)\b/.test(nt);
        const mismo = pedidos.length === 1 && pedidos[0].cantidad
          ? e.carrito.findIndex((i) => i.producto === pedidos[0].producto)
          : -1;
        if (cambio && mismo >= 0) {
          const [item] = e.carrito.splice(mismo, 1);
          e.carrito.push(item);
          cambiarCantidad(e, pedidos[0].cantidad, ahora, salida);
          return fin();
        }
        empezarProductos(e, pedidos, ahora, salida);
        return fin();
      }
      const cant = cantidadDe(t);
      if (cant && cambiarCantidad(e, cant, ahora, salida)) return fin();
      if (it.si) { iniciarPedido(e, salida); return fin(); }
      if (it.no) {
        e.etapa = 'curioso';
        salida.push(texto('¡Con gusto! 😊 Cuando esté listo, escríbanos por aquí y le atendemos.'));
        return fin();
      }
      break;
    }
    case 'otro_desc': {
      e.carrito.push({ producto: 'otro', descripcion: t.trim(), precio: null, especial: true, cantidad: cantidadDe(t) || 0 });
      e.motivo = 'producto fuera de lista';
      salida.push(texto(`Gracias. ${NEGOCIO.colaboradora} le prepara la cotización.`));
      iniciarPedido(e, salida);
      return fin();
    }
    case 'fecha': {
      const f = interpretarFecha(t, ahora);
      e.fecha = f.fecha ? f.fecha.toISOString() : null;
      e.fechaTexto = f.fecha ? textoFecha(f.fecha) : t.trim();
      e.urgencia = f.urgencia;
      e.etapa = 'arte';
      salida.push(preguntaArte());
      return fin();
    }
    case 'arte': {
      if (it.si) e.arte = 'si';
      else if (it.no || /no tengo|no lo tengo|no tengo diseno|necesito (el )?diseno|hagan(me)? el diseno/.test(norm(t))) e.arte = 'no';
      else if (/falta|algun|algunos|parte/.test(norm(t))) e.arte = 'parcial';
      if (e.arte) { terminarPedido(e, ahora, salida, eventos); return fin(); }
      break;
    }
    case 'diseno': {
      if (it.si) { e.quiereDiseno = true; pasar(e, ahora, null, salida, eventos); return fin(); }
      if (it.no) { e.quiereDiseno = false; pasar(e, ahora, null, salida, eventos); return fin(); }
      break;
    }
    default: break;
  }

  if (it.gracias) {
    salida.push(texto('¡A la orden! 😊'), ...repreguntar(e));
    return fin();
  }
  if (it.saludo && t.split(' ').length <= 3) {
    salida.push(...repreguntar(e));
    return fin();
  }
  noEntendido(e, ahora, salida, eventos);
  return fin();
}
