import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procesar } from '../src/motor.js';
import { cotizar } from '../src/cotizar.js';
import { fechaRD, cuandoAbre, abierto, interpretarFecha, urgencia } from '../src/tiempo.js';
import { pedidosDe, cantidadDe } from '../src/interpretar.js';

const LUNES_10AM = fechaRD(2026, 10, 2, 10 * 60); // lunes 2/11/2026
const SABADO_2PM = fechaRD(2026, 10, 7, 14 * 60); // sábado 7/11/2026 (lunes 9 es feriado)

function correr(pasos, ahora = LUNES_10AM) {
  let estado = null; const todo = [];
  for (const p of pasos) {
    const r = procesar(estado, typeof p === 'string' ? { tipo: 'texto', texto: p } : p, ahora);
    estado = r.estado; todo.push(r);
  }
  return { estado, todo, ultimo: todo.at(-1), eventos: todo.flatMap((r) => r.eventos) };
}
const textos = (r) => r.mensajes.map((m) => m.texto || '').join('\n');

test('precios: reglas confirmadas', () => {
  assert.deepEqual(cotizar('volantes', '1lado', 150).ofertas, [[100, 1300], [300, 3000]]);
  assert.deepEqual(cotizar('volantes', '1lado', 900).ofertas[0], [1000, 4900]);
  assert.equal(cotizar('volantes', '1lado', 5000).pasar, true);
  assert.deepEqual(cotizar('tarjetas', 'laminado', 250).ofertas, [[250, 1250], [500, 2000]]);
  assert.deepEqual(cotizar('tarjetas', 'sin_laminado', 300).ofertas[0], [300, 1000]);
  assert.equal(cotizar('tarjetas', 'laminado', 300).ofertas.length, 1);
  assert.deepEqual(cotizar('stickers', '2x2', 480).ofertas, [[480, 864], [500, 850]]);
  assert.equal(cotizar('bolsas', '12x4x8', 250).pasar, true);
  assert.deepEqual(cotizar('bolsas', '5x3x7.25', 120).ofertas[0], [120, 6720]);
  assert.equal(cotizar('talonarios', '1color', 30).pasar, true);
  assert.deepEqual(cotizar('tags', '2x3', 50).ofertas[0], [100, 1000]);
});

test('horario y feriados', () => {
  assert.equal(abierto(LUNES_10AM), true);
  assert.equal(abierto(fechaRD(2026, 10, 9, 10 * 60)), false); // feriado Constitución
  assert.equal(cuandoAbre(SABADO_2PM), 'el martes 10 de noviembre a partir de las 9:00 a. m.');
  assert.equal(cuandoAbre(fechaRD(2026, 10, 3, 7 * 60)), 'hoy a partir de las 9:00 a. m.');
  assert.equal(cuandoAbre(fechaRD(2026, 10, 6, 18 * 60)), 'mañana sábado a partir de las 9:00 a. m.');
  assert.equal(cuandoAbre(fechaRD(2026, 11, 24, 18 * 60)), 'el sábado 26 de diciembre a partir de las 9:00 a. m.');
});

test('fechas y urgencia', () => {
  const f = (t) => interpretarFecha(t, LUNES_10AM);
  assert.equal(f('mañana').urgencia, 'alta');
  assert.equal(f('para el viernes').urgencia, 'media');
  assert.equal(f('20/11').urgencia, 'baja');
  assert.equal(f('15 de noviembre').urgencia, 'baja');
  assert.equal(f('en 2 semanas').urgencia, 'baja');
  assert.equal(f('urgente').urgencia, 'alta');
  assert.equal(f('no tengo prisa').urgencia, 'baja');
  assert.equal(f('cuando pueda').entendida, false);
  assert.equal(urgencia(fechaRD(2026, 10, 9), LUNES_10AM), 'media');
});

test('entiende varios productos en un mensaje', () => {
  const p = pedidosDe('Necesito 500 tarjetas con laminado y 150 volantes a dos lados');
  assert.deepEqual(p, [
    { producto: 'tarjetas', cantidad: 500, variante: 'laminado' },
    { producto: 'volantes', cantidad: 150, variante: '2lados' },
  ]);
  assert.equal(cantidadDe('quiero 1,000 stickers de 2x2'), 1000);
  assert.equal(cantidadDe('stickers 3x3'), null);
  assert.equal(cantidadDe('quinientas tarjetas'), 500);
});

test('saludo sin botón de persona', () => {
  const { todo } = correr(['Hola']);
  const m = todo[0].mensajes[0];
  assert.equal(m.tipo, 'lista');
  assert.ok(!m.filas.some((f) => /hablar|persona$/i.test(f.titulo)));
});

test('flujo completo con diseño y pase a Verónica', () => {
  const { eventos, ultimo } = correr(['Hola', { tipo: 'lista', id: 'tarjetas' }, { tipo: 'boton', id: 'laminado' }, '250',
    { tipo: 'boton', id: 'pedido' }, 'para el viernes', { tipo: 'boton', id: 'arte_no' }, { tipo: 'boton', id: 'diseno_si' }]);
  const pase = eventos.find((e) => e.tipo === 'pase');
  assert.equal(pase.ticket, 1250);
  assert.equal(pase.urgencia, 'media');
  assert.equal(pase.quiereDiseno, true);
  assert.match(textos(ultimo), /Verónica, quien le atenderá|Verónica\*, quien/);
});

test('varios productos: el ticket es la suma', () => {
  const { eventos } = correr(['vengo de Instagram, 500 tarjetas con laminado y 300 volantes de un lado',
    { tipo: 'boton', id: 'pedido' }, 'mañana', { tipo: 'boton', id: 'arte_si' }]);
  const pase = eventos.find((e) => e.tipo === 'pase');
  assert.equal(pase.ticket, 5000);
  assert.equal(pase.items.length, 2);
  assert.equal(pase.origen, 'instagram');
});

test('fuera de horario avisa cuándo responde Verónica (salta el feriado)', () => {
  const { ultimo } = correr(['300 volantes de un lado', { tipo: 'boton', id: 'pedido' }, '20/11', { tipo: 'boton', id: 'arte_si' }], SABADO_2PM);
  assert.match(textos(ultimo), /martes 10 de noviembre/);
});

test('persona: primero pregunta el producto, luego pasa', () => {
  const r = correr(['quiero hablar con una persona', 'que me atienda alguien']);
  assert.equal(r.todo[0].eventos.length, 0);
  assert.equal(r.eventos[0].motivo, 'pidió persona');
});

test('segunda nota de voz pasa a Verónica', () => {
  const r = correr([{ tipo: 'audio' }, { tipo: 'audio' }]);
  assert.equal(r.todo[0].eventos.length, 0);
  assert.equal(r.eventos[0].motivo, 'nota de voz');
});

test('ubicación envía el pin', () => {
  const r = correr(['donde estan ubicados?']);
  assert.equal(r.todo[0].mensajes[0].tipo, 'ubicacion');
});

test('después del pase el bot se calla y avisa si llega un archivo', () => {
  const r = correr(['quiero hablar con alguien', 'alguien por favor', 'hola?', { tipo: 'imagen' }]);
  assert.equal(r.todo[2].mensajes.length, 0);
  assert.deepEqual(r.todo[3].eventos, [{ tipo: 'archivo', archivo: 'imagen' }]);
});

test('cotización especial pasa con ticket promedio', () => {
  const r = correr(['necesito 300 bolsas de 12x4x8', 'en 2 semanas', { tipo: 'boton', id: 'arte_si' }]);
  const pase = r.eventos.find((e) => e.tipo === 'pase');
  assert.equal(pase.motivo, 'cotización especial');
  assert.equal(pase.ticket, 3000);
});
