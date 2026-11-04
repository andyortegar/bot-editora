import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { usarFetch } from '../servidor/red.js';
import { leerConfig } from '../servidor/config.js';
import { crearAlmacen } from '../servidor/almacen.js';
import { crearApp } from '../servidor/app.js';
import { crearServidor } from '../servidor/index.js';
import { ordenarCola } from '../servidor/cola.js';
import { aWhatsApp } from '../servidor/whatsapp.js';
import { textoCanonico } from '../servidor/ia.js';
import { fechaRD } from '../src/tiempo.js';

const LUNES_10AM = fechaRD(2026, 10, 2, 10 * 60);
let llamadas, respuestasIA, app, almacen, config;

const resp = (obj, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => obj, text: async () => JSON.stringify(obj), arrayBuffer: async () => new TextEncoder().encode('imagen').buffer });

function fetchFalso(url, opciones = {}) {
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  llamadas.push({ url, cuerpo });
  if (url.includes('api.anthropic.com')) return Promise.resolve(resp({ content: [{ type: 'text', text: JSON.stringify(respuestasIA.shift() || {}) }] }));
  if (url.includes('api.telegram.org')) return Promise.resolve(resp({ ok: true, result: { message_id: 77 } }));
  if (url.endsWith('/messages')) return Promise.resolve(resp({ messages: [{ id: 'wamid.x' }] }));
  if (url.endsWith('/media123')) return Promise.resolve(resp({ url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime_type: 'image/jpeg' }));
  return Promise.resolve(resp({}));
}

beforeEach(() => {
  llamadas = []; respuestasIA = [];
  usarFetch(fetchFalso);
  config = leerConfig({ D360_API_KEY: 'k', TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: '1', ANTHROPIC_API_KEY: 'a', PANEL_CLAVE: 'secreta' });
  almacen = crearAlmacen(null);
  app = crearApp({ config, almacen, reloj: () => LUNES_10AM, log: { error() {} } });
});

const webhook = (mensajes, campo = 'messages') => ({
  entry: [{ changes: [{ field: campo, value: campo === 'messages'
    ? { contacts: [{ wa_id: '18095550001', profile: { name: 'Juan' } }], messages: mensajes }
    : { message_echoes: mensajes } }] }],
});
const texto = (t) => webhook([{ from: '18095550001', type: 'text', text: { body: t } }]);
const boton = (id) => webhook([{ from: '18095550001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: id } } }]);
const lista = (id) => webhook([{ from: '18095550001', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id, title: id } } }]);
const enviados = () => llamadas.filter((l) => l.url.endsWith('/messages')).map((l) => l.cuerpo);
const telegram = (metodo) => llamadas.filter((l) => l.url.includes('api.telegram.org') && l.url.endsWith(metodo));

test('convierte botones y listas al formato de WhatsApp', () => {
  const b = aWhatsApp('1', { tipo: 'botones', texto: 'x', botones: [{ id: 'a', titulo: 'Quiero hacer pedido' }] });
  assert.equal(b.interactive.type, 'button');
  assert.equal(b.interactive.action.buttons[0].reply.title, 'Quiero hacer pedido');
  const l = aWhatsApp('1', { tipo: 'lista', texto: 'x', boton: 'Ver productos', filas: [{ id: 'tarjetas', titulo: 'Tarjetas de presentación' }] });
  assert.equal(l.interactive.action.sections[0].rows[0].title, 'Tarjetas de presentación');
});

test('conversación completa: responde por WhatsApp y avisa a Verónica', async () => {
  await app.whatsapp(texto('Hola, vengo de Instagram'));
  assert.equal(enviados()[0].interactive.type, 'list');
  await app.whatsapp(lista('tarjetas'));
  await app.whatsapp(boton('laminado'));
  await app.whatsapp(texto('500'));
  await app.whatsapp(boton('pedido'));
  await app.whatsapp(texto('para el viernes'));
  await app.whatsapp(boton('arte_si'));
  const chat = almacen.datos.chats['18095550001'];
  assert.equal(chat.nombre, 'Juan');
  assert.equal(chat.pase.ticket, 2000);
  assert.deepEqual(almacen.datos.cola, ['18095550001']);
  const aviso = telegram('sendMessage').find((l) => l.cuerpo.text.includes('Nuevo cliente'));
  assert.match(aviso.cuerpo.text, /RD\$2,000/);
  assert.match(aviso.cuerpo.text, /Instagram/);
  assert.equal(telegram('pinChatMessage').length, 1);
});

test('si Verónica responde desde la app, sale de la cola y el bot se calla', async () => {
  for (const p of [texto('quiero hablar con una persona'), texto('alguien por favor')]) await app.whatsapp(p);
  assert.equal(almacen.datos.cola.length, 1);
  await app.whatsapp(webhook([{ to: '18095550001', type: 'text', text: { body: 'Hola Juan' } }], 'smb_message_echoes'));
  assert.equal(almacen.datos.cola.length, 0);
  const antes = enviados().length;
  await app.whatsapp(texto('ok gracias'));
  assert.equal(enviados().length, antes);
});

test('si las reglas no entienden, pregunta a la IA y sigue', async () => {
  await app.whatsapp(texto('Hola'));
  respuestasIA.push({ pedidos: [{ producto: 'volantes', cantidad: 1000, variante: '1lado' }], fecha: null, quiere_persona: false, quiere_ofertas: false });
  await app.whatsapp(texto('necesito unos papelitos para repartir, como mil, por una cara nada más'));
  const ultimo = enviados().at(-1);
  assert.match(ultimo.interactive?.body?.text || ultimo.text?.body, /1,000 volantes de un lado: RD\$4,900/);
  assert.equal(almacen.datos.chats['18095550001'].usosIA, 1);
});

test('comprobante de un cliente atendido: avisa con botones y se confirma', async () => {
  for (const p of [texto('quiero hablar con una persona'), texto('alguien')]) await app.whatsapp(p);
  respuestasIA.push({ es_comprobante: true, tipo: 'comprobante', monto: 2500, banco: 'Banco Popular', fecha: '02/11/2026', referencia_ultimos4: '8841' });
  await app.whatsapp(webhook([{ from: '18095550001', type: 'image', image: { id: 'media123' } }]));
  const aviso = telegram('sendMessage').find((l) => l.cuerpo.text.includes('Comprobante'));
  assert.match(aviso.cuerpo.text, /RD\$2,500 · Banco Popular/);
  assert.equal(aviso.cuerpo.reply_markup.inline_keyboard[0][0].callback_data, 'pago:18095550001:2500');
  await app.telegram({ callback_query: { id: 'c1', data: 'pago:18095550001:2500', message: { message_id: 5, chat: { id: 1 } } } });
  assert.equal(almacen.datos.chats['18095550001'].resultado.estado, 'vendido');
  assert.equal(almacen.datos.chats['18095550001'].resultado.monto, 2500);
});

test('botón Terminado saca al cliente de la cola', async () => {
  for (const p of [texto('quiero hablar con una persona'), texto('alguien')]) await app.whatsapp(p);
  await app.telegram({ callback_query: { id: 'c2', data: 'fin:18095550001', message: { message_id: 5, chat: { id: 1 } } } });
  assert.equal(almacen.datos.cola.length, 0);
});

test('cola: primero el ticket más alto; la urgencia desempata montos parecidos', () => {
  const chats = {
    a: { pase: { ticket: 5000, urgencia: 'baja', fecha: '1' } },
    b: { pase: { ticket: 9000, urgencia: 'baja', fecha: '2' } },
    c: { pase: { ticket: 4800, urgencia: 'alta', fecha: '3' } },
  };
  assert.deepEqual(ordenarCola(['a', 'b', 'c'], chats), ['b', 'c', 'a']);
});

test('texto canónico de la IA', () => {
  assert.equal(textoCanonico({ pedidos: [{ producto: 'tarjetas', cantidad: 500, variante: 'laminado' }] }), '500 tarjeta con laminado');
  assert.equal(textoCanonico({ quiere_persona: true }), 'quiero hablar con una persona');
});

test('panel: pide clave y muestra la cola', async () => {
  for (const p of [texto('quiero hablar con una persona'), texto('alguien')]) await app.whatsapp(p);
  const servidor = crearServidor({ config, almacen, app }).listen(0);
  const puerto = servidor.address().port;
  const fetchReal = globalThis.fetch;
  try {
    const sin = await fetchReal(`http://127.0.0.1:${puerto}/panel`);
    assert.equal(sin.status, 401);
    const auth = { Authorization: `Basic ${Buffer.from('veronica:secreta').toString('base64')}` };
    const con = await fetchReal(`http://127.0.0.1:${puerto}/panel`, { headers: auth });
    assert.match(await con.text(), /En espera de Verónica \(1\)/);
    const est = await fetchReal(`http://127.0.0.1:${puerto}/panel/estadisticas`, { headers: auth });
    assert.match(await est.text(), /chats nuevos/);
  } finally { servidor.close(); }
});

test('el dueño recibe su propia cola fijada y una alerta si alguien espera demasiado', async () => {
  let ahora = LUNES_10AM;
  const cfg = leerConfig({ D360_API_KEY: 'k', TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: '1', TELEGRAM_CHAT_SUPERVISOR: '999', ALERTA_ESPERA_MIN: '30' });
  const alm = crearAlmacen(null);
  const ap = crearApp({ config: cfg, almacen: alm, reloj: () => ahora, log: { error() {} } });
  for (const p of [texto('quiero hablar con una persona'), texto('alguien')]) await ap.whatsapp(p);
  const fijados = telegram('pinChatMessage').map((l) => l.cuerpo.chat_id);
  assert.deepEqual(fijados.sort(), ['1', '999']);
  // A los 10 minutos no hay alerta; a los 35 sí, y solo una vez y solo al dueño.
  ahora = new Date(LUNES_10AM.getTime() + 10 * 60000);
  await ap.revisarEsperas();
  ahora = new Date(LUNES_10AM.getTime() + 35 * 60000);
  await ap.revisarEsperas();
  await ap.revisarEsperas();
  const alertas = telegram('sendMessage').filter((l) => l.cuerpo.text.includes('esperando'));
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].cuerpo.chat_id, '999');
  assert.match(alertas[0].cuerpo.text, /35 min/);
  // La cola muestra cuánto lleva esperando.
  const ediciones = telegram('editMessageText').map((l) => l.cuerpo.text);
  assert.ok(ediciones.some((t) => /hace 35 min/.test(t)));
});

test('fuera de horario no cuenta la espera', async () => {
  const domingo = fechaRD(2026, 10, 8, 15 * 60); // domingo 8/11, 3 p. m.
  let ahora = domingo;
  const cfg = leerConfig({ TELEGRAM_TOKEN: 't', TELEGRAM_CHAT_ID: '1', TELEGRAM_CHAT_SUPERVISOR: '999', D360_API_KEY: 'k' });
  const alm = crearAlmacen(null);
  const ap = crearApp({ config: cfg, almacen: alm, reloj: () => ahora, log: { error() {} } });
  for (const p of [texto('quiero hablar con una persona'), texto('alguien')]) await ap.whatsapp(p);
  ahora = fechaRD(2026, 10, 10, 9 * 60 + 20); // martes 10/11 9:20 a. m. (lunes 9 es feriado)
  await ap.revisarEsperas();
  assert.equal(telegram('sendMessage').filter((l) => l.cuerpo.text.includes('esperando')).length, 0);
  ahora = fechaRD(2026, 10, 10, 9 * 60 + 40);
  await ap.revisarEsperas();
  assert.equal(telegram('sendMessage').filter((l) => l.cuerpo.text.includes('esperando')).length, 1);
});
