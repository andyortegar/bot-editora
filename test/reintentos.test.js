// Límite de velocidad de WhatsApp (429): el bot espera y reintenta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usarFetch, usarDormir } from '../servidor/red.js';
import { enviar } from '../servidor/whatsapp.js';

const resp = (status, obj = {}) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });
const config = { d360Url: 'https://x', d360Clave: 'k' };

test('con 429 espera y reintenta hasta que pasa', async () => {
  const esperas = []; let llamadas = 0;
  usarDormir(async (ms) => { esperas.push(ms); });
  usarFetch(async () => (++llamadas < 3 ? resp(429, { error: 'Too many requests for one number' }) : resp(200, { messages: [{ id: 'w' }] })));
  const r = await enviar(config, { to: '1' });
  assert.equal(r.messages[0].id, 'w');
  assert.deepEqual(esperas, [2000, 5000]);
});

test('si sigue en 429 después de 3 reintentos, falla con el código', async () => {
  usarDormir(async () => {});
  usarFetch(async () => resp(429, { error: 'Too many requests for one number' }));
  await assert.rejects(enviar(config, { to: '1' }), (e) => e.status === 429);
});

test('otros errores no se reintentan', async () => {
  let llamadas = 0;
  usarDormir(async () => { throw new Error('no debería esperar'); });
  usarFetch(async () => { llamadas++; return resp(400, { error: 'x' }); });
  await assert.rejects(enviar(config, { to: '1' }), (e) => e.status === 400);
  assert.equal(llamadas, 1);
});
