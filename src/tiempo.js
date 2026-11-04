// Fechas, horario y feriados en hora de República Dominicana (UTC-4, sin horario de verano).
import { HORARIO, FERIADOS } from './config.js';

const OFFSET_MS = -4 * 60 * 60 * 1000;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Partes de la fecha en hora de RD.
export function rd(fecha) {
  const d = new Date(fecha.getTime() + OFFSET_MS);
  return {
    anio: d.getUTCFullYear(), mes: d.getUTCMonth(), dia: d.getUTCDate(),
    semana: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

// Fecha (a medianoche de RD) de un año/mes/día.
export function fechaRD(anio, mes, dia, minutos = 0) {
  return new Date(Date.UTC(anio, mes, dia, 0, minutos) - OFFSET_MS);
}

const iso = ({ anio, mes, dia }) => `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

export function feriado(fecha) {
  return FERIADOS[iso(rd(fecha))] || null;
}

export function abierto(ahora) {
  const p = rd(ahora);
  const h = HORARIO[p.semana];
  return Boolean(h) && !feriado(ahora) && p.minutos >= h[0] && p.minutos < h[1];
}

// Próximo momento en que el negocio está abierto (ahora mismo si ya lo está).
export function proximaApertura(ahora) {
  if (abierto(ahora)) return ahora;
  const hoy = rd(ahora);
  for (let i = 0; i < 30; i++) {
    const dia = fechaRD(hoy.anio, hoy.mes, hoy.dia + i);
    const p = rd(dia);
    const h = HORARIO[p.semana];
    if (!h || feriado(dia)) continue;
    const apertura = fechaRD(p.anio, p.mes, p.dia, h[0]);
    if (apertura > ahora) return apertura;
  }
  return null;
}

const hora = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 12 && m === 0) return '12:00 m.';
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${sufijo}`;
};

// "hoy a partir de las 9:00 a. m.", "mañana sábado a partir de...", "el martes 10 de noviembre a partir de..."
export function cuandoAbre(ahora) {
  const ap = proximaApertura(ahora);
  const a = rd(ap), h = rd(ahora);
  const diasEntre = Math.round((fechaRD(a.anio, a.mes, a.dia) - fechaRD(h.anio, h.mes, h.dia)) / 86400000);
  const desde = `a partir de las ${hora(a.minutos)}`;
  if (diasEntre === 0) return `hoy ${desde}`;
  if (diasEntre === 1) return `mañana ${DIAS[a.semana]} ${desde}`;
  return `el ${DIAS[a.semana]} ${a.dia} de ${MESES[a.mes]} ${desde}`;
}

export function textoFecha(fecha) {
  const p = rd(fecha);
  return `${DIAS[p.semana]} ${p.dia}/${p.mes + 1}`;
}

// Días corridos entre hoy y la fecha pedida.
export function diasHasta(fecha, ahora) {
  const a = rd(ahora), f = rd(fecha);
  return Math.round((fechaRD(f.anio, f.mes, f.dia) - fechaRD(a.anio, a.mes, a.dia)) / 86400000);
}

export function urgencia(fecha, ahora) {
  if (!fecha) return null;
  const d = diasHasta(fecha, ahora);
  if (d < 3) return 'alta';
  if (d <= 7) return 'media';
  return 'baja';
}

// --- Interpretar la fecha que escribe el cliente ---------------------------------

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const NUM_PAL = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15 };

// Devuelve { fecha: Date|null, urgencia: 'alta'|'media'|'baja'|null, entendida: bool }
export function interpretarFecha(texto, ahora) {
  const t = norm(texto);
  const hoy = rd(ahora);
  const dia = (n) => fechaRD(hoy.anio, hoy.mes, hoy.dia + n);
  const con = (fecha) => ({ fecha, urgencia: urgencia(fecha, ahora), entendida: true });

  if (/\b(urgente|cuanto antes|lo antes posible|lo mas pronto|ya mismo|para ya|de inmediato|hoy mismo|hoy)\b/.test(t)) return con(dia(0));
  if (/pasado manana/.test(t)) return con(dia(2));
  if (/\bmanana\b/.test(t)) return con(dia(1));
  if (/\b(sin prisa|no tengo prisa|no hay prisa|no hay apuro|sin apuro|cuando sea|no es urgente)\b/.test(t)) {
    return { fecha: null, urgencia: 'baja', entendida: true };
  }

  let m = t.match(/\ben (\d+|[a-z]+) (dia|dias|semana|semanas|mes|meses)\b/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_PAL[m[1]];
    if (n) {
      const mult = m[2].startsWith('semana') ? 7 : m[2].startsWith('mes') ? 30 : 1;
      return con(dia(n * mult));
    }
  }
  if (/\b(proxima semana|semana que viene|siguiente semana)\b/.test(t)) return con(dia(7));
  if (/\b(fin de mes|final de mes|finales de mes)\b/.test(t)) return con(fechaRD(hoy.anio, hoy.mes + 1, 0));

  // 15/11, 15-11, 15/11/2026
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]), mes = Number(m[2]) - 1;
    let anio = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : hoy.anio;
    let f = fechaRD(anio, mes, d);
    if (!m[3] && diasHasta(f, ahora) < 0) f = fechaRD(anio + 1, mes, d);
    if (mes >= 0 && mes < 12 && d >= 1 && d <= 31) return con(f);
  }

  // 15 de noviembre
  m = t.match(/\b(\d{1,2}) de ([a-z]+)\b/);
  if (m) {
    const mes = MESES.map(norm).indexOf(m[2]);
    if (mes >= 0) {
      let f = fechaRD(hoy.anio, mes, Number(m[1]));
      if (diasHasta(f, ahora) < 0) f = fechaRD(hoy.anio + 1, mes, Number(m[1]));
      return con(f);
    }
  }

  // el viernes, para el lunes
  const dias = DIAS.map(norm);
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b${dias[i]}\\b`).test(t)) {
      let n = (i - hoy.semana + 7) % 7;
      if (n === 0) n = 7; // "el viernes" dicho un viernes = el de la semana que viene
      return con(dia(n));
    }
  }

  // "el 15" / "para el 20"
  m = t.match(/\b(?:el|dia)\s+(\d{1,2})\b/);
  if (m) {
    const d = Number(m[1]);
    if (d >= 1 && d <= 31) {
      let f = fechaRD(hoy.anio, hoy.mes, d);
      if (diasHasta(f, ahora) < 0) f = fechaRD(hoy.anio, hoy.mes + 1, d);
      return con(f);
    }
  }

  return { fecha: null, urgencia: null, entendida: false };
}
