// Clientes con nombre de usuario de WhatsApp: llegan sin teléfono, solo con su BSUID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usarFetch } from '../servidor/red.js';
import { leerConfig } from '../servidor/config.js';
import { crearAlmacen } from '../servidor/almacen.js';
import { crearApp } from '../servidor/app.js';
import { aWhatsApp, leerWebhook } from '../servidor/whatsapp.js';
import { panelPrincipal } from '../servidor/panel.js';
import { fechaRD } from '../src/tiempo.js';

const BSUID = 'DO.2583092718868191';
const ok = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });

test('lee mensajes, ecos y estados que vienen solo con BSUID', () => {
  const s = leerWebhook({ entry: [{ changes: [
    { field: 'messages', value: { contacts: [{ user_id: BSUID, profile: { name: 'María' } }], messages: [{ from_user_id: BSUID, type: 'text', text: { body: 'Hola' } }], statuses: [{ recipient_user_id: BSUID, status: 'failed', errors: [{ title: 'x' }] }] } },
    { field: 'smb_message_echoes', value: { message_echoes: [{ from: '18297422974', to_user_id: BSUID, type: 'text', text: { body: 'Hola María' } }] } },
  ] }] });
  assert.deepEqual(s.map((x) => [x.tipo, x.telefono]), [['mensaje', BSUID], ['estado', BSUID], ['eco', BSUID]]);
  assert.equal(s[0].nombre, 'María');
});

test('a un BSUID se le escribe con "recipient" y a un teléfono con "to"', () => {
  assert.equal(aWhatsApp(BSUID, { tipo: 'texto', texto: 'x' }).recipient, BSUID);
  assert.equal(aWhatsApp(BSUID, { tipo: 'texto', texto: 'x' }).to, undefined);
  assert.equal(aWhatsApp('18095550001', { tipo: 'texto', texto: 'x' }).to, '18095550001');
});

test('conversación completa con un cliente sin teléfono', async () => {
  const llamadas = [];
  usarFetch((url, o = {}) => { llamadas.push({ url, cuerpo: o.body ? JSON.parse(o.body) : null }); return Promise.resolve(ok({ ok: true, result: { message_id: 1 }, messages: [{ id: 'w' }] })); });
  const almacen = crearAlmacen(null);
  const app = crearApp({ config: leerConfig({ D360_API_KEY: 'k', TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: '1' }), almacen, reloj: () => fechaRD(2026, 10, 2, 10 * 60), log: { error() {} } });
  const msg = (t) => ({ entry: [{ changes: [{ field: 'messages', value: { contacts: [{ user_id: BSUID, profile: { name: 'María' } }], messages: [{ from_user_id: BSUID, type: 'text', text: { body: t } }] } }] }] });
  for (const t of ['quiero hablar con una persona', 'alguien por favor']) await app.whatsapp(msg(t));
  const envios = llamadas.filter((l) => l.url.endsWith('/messages')).map((l) => l.cuerpo);
  assert.ok(envios.length > 0 && envios.every((c) => c.recipient === BSUID && !c.to));
  assert.deepEqual(almacen.datos.cola, [BSUID]);
  const aviso = llamadas.find((l) => l.url.endsWith('sendMessage') && l.cuerpo.text.includes('Nuevo cliente')).cuerpo;
  assert.match(aviso.text, /usuario sin número visible/);
  assert.deepEqual(aviso.reply_markup.inline_keyboard[0].map((b) => b.text), ['Terminado']);
  assert.match(panelPrincipal(almacen.datos), /usuario sin número visible/);
});
