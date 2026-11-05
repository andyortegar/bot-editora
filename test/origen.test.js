// Origen "anuncio": chats que llegan por anuncios de clic a WhatsApp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usarFetch } from '../servidor/red.js';
import { leerConfig } from '../servidor/config.js';
import { crearAlmacen } from '../servidor/almacen.js';
import { crearApp } from '../servidor/app.js';
import { intencion } from '../src/interpretar.js';
import { fechaRD } from '../src/tiempo.js';

const ok = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });

test('el texto automático del anuncio marca el origen', () => {
  assert.equal(intencion('Hello! Can I get more info on this?').origen, 'anuncio');
  assert.equal(intencion('¡Hola! Quiero más información').origen, 'anuncio');
  assert.equal(intencion('Hola, vengo de Instagram').origen, 'instagram');
});

test('un mensaje con "referral" de anuncio queda con origen anuncio en el pase y en las estadísticas', async () => {
  usarFetch(() => Promise.resolve(ok({ ok: true, result: { message_id: 1 }, messages: [{ id: 'w' }] })));
  const almacen = crearAlmacen(null);
  const app = crearApp({ config: leerConfig({ D360_API_KEY: 'k', TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }), almacen, reloj: () => fechaRD(2026, 10, 2, 10 * 60), log: { error() {} } });
  const msg = (t, extra = {}) => ({ entry: [{ changes: [{ field: 'messages', value: { contacts: [{ wa_id: '18095550002', profile: { name: 'Ana' } }], messages: [{ from: '18095550002', type: 'text', text: { body: t }, ...extra }] } }] }] });
  await app.whatsapp(msg('Hola', { referral: { source_type: 'ad', source_id: '123' } }));
  for (const t of ['quiero hablar con una persona', 'alguien por favor']) await app.whatsapp(msg(t));
  assert.equal(almacen.datos.eventos.find((e) => e.tipo === 'chat_nuevo').origen, 'anuncio');
  assert.equal(almacen.datos.chats['18095550002'].pase.origen, 'anuncio');
});
