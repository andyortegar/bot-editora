// Entiende el texto libre del cliente con reglas (sin IA).
// En el servidor, si estas reglas no entienden, se le pregunta a Claude Haiku.
import { CATALOGO } from './config.js';

export const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

const contiene = (t, re) => re.test(t);

// --- Intenciones generales --------------------------------------------------------
export function intencion(texto) {
  const t = norm(texto);
  return {
    ubicacion: contiene(t, /\b(donde (estan|queda|quedan|estan ubicados|se encuentran)|ubicacion|ubicados|direccion|como llego|como llegar|localizacion|mapa|location)\b/),
    horario: contiene(t, /\b(horario|a que hora|hasta que hora|abren|cierran|estan abiertos|abierto hoy|trabajan hoy)\b/),
    llamar: contiene(t, /\b(llamar|llamada|llamarles|llamarlos|los llamo|le llamo|puedo llamar)\b/),
    itbis: contiene(t, /\b(itbis|impuesto|impuestos)\b/),
    persona: contiene(t, /\b(persona|humano|alguien|asesor|asesora|agente|representante|vendedor|vendedora|operador|operadora|hablar con|atencion al cliente|una muchacha|veronica)\b/),
    ofertas: contiene(t, /\b(oferta|ofertas|promocion|promociones|promo|especial(es)? de la semana)\b/),
    gracias: contiene(t, /^(muchas )?(gracias|ok|okay|oki|perfecto|listo|dale|bien|excelente|genial|entendido)\b/),
    saludo: contiene(t, /^(hola|buen(as|os)?( dias| tardes| noches)?|saludos|que tal|klk|hey)\b/),
    origen: /vengo de instagram/.test(t) ? 'instagram' : /vengo de facebook/.test(t) ? 'facebook' : /vengo de (la|su) pagina( web)?/.test(t) ? 'web' : /can i get more info on this|quiero mas informacion/.test(t) ? 'anuncio' : null,
    si: contiene(t, /^(si|sí|claro|por supuesto|de acuerdo|correcto|asi es|ok|dale)\b/),
    no: contiene(t, /^(no|nop|nel|negativo|todavia no|aun no)\b/),
  };
}

// --- Números ---------------------------------------------------------------------
const PALABRAS_NUM = [
  [/\bun ciento\b/, 100], [/\bcien\b/, 100], [/\bdoscient[oa]s\b/, 200], [/\btrescient[oa]s\b/, 300],
  [/\bcuatrocient[oa]s\b/, 400], [/\bquinient[oa]s\b/, 500], [/\bseiscient[oa]s\b/, 600],
  [/\bsetecient[oa]s\b/, 700], [/\bochocient[oa]s\b/, 800], [/\bnovecient[oa]s\b/, 900],
  [/\bcinco mil\b/, 5000], [/\bcuatro mil\b/, 4000], [/\btres mil\b/, 3000], [/\bdos mil\b/, 2000],
  [/\bun millar\b/, 1000], [/\bmil\b/, 1000],
  [/\bdieciocho\b/, 18], [/\bcincuenta\b/, 50], [/\bveinte\b/, 20], [/\btreinta\b/, 30],
  [/\bdiez\b/, 10], [/\bcinco\b/, 5], [/\bcuatro\b/, 4], [/\btres\b/, 3], [/\bdos\b/, 2], [/\b(un|una|uno)\b/, 1],
];

// Quita tamaños (2x2, 5.5 x 8.5, 12x4x8, 31 x 80), fechas y precios para no confundirlos con cantidades.
function limpiar(t) {
  return t
    .replace(/\d+(\.\d+)?\s*(x|por)\s*\d+(\.\d+)?(\s*(x|por)\s*\d+(\.\d+)?)?\s*(pulgadas|pulg|pies|"|')?/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, ' ')
    .replace(/\b(para el|el dia|dia|el)\s+\d{1,2}\b(?!\s*(tarjeta|volante|sticker|tag|bolsa|talonario|brochure|banner|roll))/g, ' ')
    .replace(/\b\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g, ' ')
    .replace(/rd\$?\s*\d[\d,.]*/g, ' ')
    .replace(/\b(1|un|una) (lado|cara|color)\b/g, ' ')
    .replace(/\b(2|dos) (lados|caras)\b/g, ' ');
}

export function cantidadDe(texto) {
  const t = limpiar(norm(texto));
  const m = t.match(/\b(\d{1,3}(?:[,.]\d{3})+|\d+)\s*(k|mil)?\b/);
  if (m) {
    let n = Number(m[1].replace(/[,.]/g, ''));
    if (m[2]) n *= 1000;
    if (n > 0) return n;
  }
  for (const [re, n] of PALABRAS_NUM) if (re.test(t)) {
    // "dos mil", "tres mil"... ya están antes que "mil"; "un" solo cuenta si va pegado a un producto
    if (n === 1 && !/\b(un|una|uno) (roll|banner|rollup)/.test(t)) continue;
    return n;
  }
  return null;
}

// --- Productos -------------------------------------------------------------------
function productoDe(segmento) {
  // Se revisan primero las palabras más largas ("etiqueta colgante" antes que "etiqueta").
  let mejor = null;
  for (const p of CATALOGO) {
    for (const pal of p.palabras) {
      const re = new RegExp(`\\b${norm(pal)}\\b`);
      if (re.test(segmento) && (!mejor || pal.length > mejor.largo)) mejor = { id: p.id, largo: pal.length };
    }
  }
  return mejor && CATALOGO.find((p) => p.id === mejor.id);
}

// Variantes que se pueden deducir del texto.
export function variantesDe(productoId, texto) {
  const t = norm(texto);
  const r = {};
  const lam = /\bsin lamin/.test(t) ? 'sin_laminado' : /\blamin/.test(t) ? 'laminado' : null;
  switch (productoId) {
    case 'tarjetas': if (lam) r.variante = lam; break;
    case 'brochure':
      if (lam) r.variante = lam;
      if (/tripti/.test(t)) r.doblez = 'triptico';
      else if (/dipti/.test(t)) r.doblez = 'diptico';
      break;
    case 'volantes':
      if (/\b(ambos|dos|2) (lados|caras)|ambas caras|doble cara|tiro y retiro|por los dos lados/.test(t)) r.variante = '2lados';
      else if (/\b(un|1|una) (lado|cara)|una sola cara|un solo lado|solo (de )?frente/.test(t)) r.variante = '1lado';
      break;
    case 'stickers':
      if (/\b2\s*(x|por)\s*2\b/.test(t)) r.variante = '2x2';
      else if (/\b3\s*(x|por)\s*3\b/.test(t)) r.variante = '3x3';
      break;
    case 'talonarios':
      if (/full ?color|a colores|todo color|a color\b/.test(t)) r.variante = 'fullcolor';
      else if (/\b(un|1) (solo )?color|blanco y negro|una tinta/.test(t)) r.variante = '1color';
      break;
    case 'bolsas':
      if (/\b12\s*(x|por)\s*4/.test(t)) r.variante = '12x4x8';
      else if (/\b5\s*(x|por)\s*3/.test(t)) r.variante = '5x3x7.25';
      else if (/\b4\.25|\b4 1\/4/.test(t)) r.variante = '4.25x2.5x5.5';
      break;
    case 'banner_arana':
      if (/\b2\s*(x|por)\s*5/.test(t)) r.variante = '2x5';
      else if (/\b3\s*(x|por)\s*6/.test(t)) r.variante = '3x6';
      break;
    default: break;
  }
  return r;
}

// Saca uno o varios pedidos del texto: [{ producto, cantidad, variante, doblez }]
export function pedidosDe(texto) {
  const t = norm(texto);
  const segmentos = t.split(/\s*(?:,|;|\n|\+|\by\b|\btambien\b|\bademas\b|\bmas\b)\s*/).filter(Boolean);
  const pedidos = [];
  let numeroSuelto = null;
  for (const seg of segmentos) {
    const p = productoDe(seg);
    const cant = cantidadDe(seg);
    if (!p) { if (cant) numeroSuelto = cant; continue; }
    const previo = pedidos.find((x) => x.producto === p.id);
    const datos = { producto: p.id, cantidad: cant ?? numeroSuelto, ...variantesDe(p.id, seg) };
    numeroSuelto = null;
    if (previo && !previo.cantidad) Object.assign(previo, datos);
    else if (!previo) pedidos.push(datos);
  }
  // Si las variantes vinieron en otro segmento ("tarjetas, con laminado"), se aplican al único producto.
  if (pedidos.length === 1) Object.assign(pedidos[0], { ...variantesDe(pedidos[0].producto, t), ...pedidos[0] });
  return pedidos;
}
