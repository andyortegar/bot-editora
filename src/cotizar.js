// Calculadora de precios (misma lógica que cotizar.py).
// cotizar() devuelve { ofertas: [[cantidad, precio], ...], nota, pasar }.
import { PRECIOS } from './config.js';

function variante(productoId, varianteId) {
  const p = PRECIOS.productos.find((x) => x.id === productoId);
  const v = p && p.variantes.find((x) => x.id === varianteId);
  if (!v) throw new Error(`Variante desconocida: ${productoId}/${varianteId}`);
  return v;
}

function precioTramos(v, cantidad) {
  let unitario = null;
  for (const t of v.tramos) if (cantidad >= t.desde) unitario = t.precio_unitario;
  return Math.round(cantidad * unitario);
}

function precioTarjetas(v, cantidad) {
  if (cantidad === v.minimo) return v.precio_250;
  return Math.max(v.venta_minima, Math.round(cantidad * v.precio_unitario));
}

const resultado = (ofertas = [], nota = null, pasar = false) => ({ ofertas, nota, pasar });

export function cotizar(productoId, varianteId, cantidad) {
  const v = variante(productoId, varianteId);

  if (v.tipo === 'paquete_fijo') {
    const paquete = [v.cantidad, v.precio];
    if (cantidad === v.cantidad) return resultado([paquete]);
    if (cantidad < v.cantidad) return resultado([paquete], `minimo:${v.cantidad}`);
    return resultado([], null, true);
  }

  if (v.tipo === 'paquetes') {
    const paq = v.paquetes;
    if (cantidad > paq[paq.length - 1].cantidad) return resultado([], null, true);
    const cercano = [...paq].sort(
      (a, b) => Math.abs(a.cantidad - cantidad) - Math.abs(b.cantidad - cantidad) || b.cantidad - a.cantidad,
    )[0];
    const ofertas = [[cercano.cantidad, cercano.precio]];
    // Si el paquete cercano es menor que lo pedido, se ofrece el que lo cubre;
    // si no, el siguiente (para subir el ticket con mejor precio por unidad).
    const siguiente = paq.find((p) => p.cantidad > Math.max(cantidad, cercano.cantidad));
    if (siguiente) ofertas.push([siguiente.cantidad, siguiente.precio]);
    return resultado(ofertas, cercano.cantidad === cantidad ? null : 'paquetes');
  }

  if (v.tipo === 'tramos') {
    if (cantidad < v.minimo) return resultado([[v.minimo, precioTramos(v, v.minimo)]], `minimo:${v.minimo}`);
    if (v.maximo && cantidad > v.maximo) return resultado([], null, true);
    const ofertas = [[cantidad, precioTramos(v, cantidad)]];
    const sig = v.tramos.find((t) => t.desde > cantidad);
    if (sig && (!v.maximo || sig.desde <= v.maximo)) ofertas.push([sig.desde, precioTramos(v, sig.desde)]);
    return resultado(ofertas);
  }

  if (v.tipo === 'tarjetas') {
    const cant = Math.max(cantidad, v.minimo);
    const nota = cantidad < v.minimo ? `minimo:${v.minimo}` : null;
    const ofertas = [[cant, precioTarjetas(v, cant)]];
    const precioSug = precioTarjetas(v, v.sugerir);
    if (cant < v.sugerir && precioSug / v.sugerir < ofertas[0][1] / cant) ofertas.push([v.sugerir, precioSug]);
    return resultado(ofertas, nota);
  }

  throw new Error(`Tipo de precio desconocido: ${v.tipo}`);
}

// Precio de referencia de la cantidad elegida (null si es cotización especial).
export function precioDe(productoId, varianteId, cantidad) {
  const r = cotizar(productoId, varianteId, cantidad);
  return r.pasar ? null : r.ofertas[0];
}
