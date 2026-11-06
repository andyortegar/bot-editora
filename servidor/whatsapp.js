// WhatsApp por 360dialog: leer el webhook y enviar mensajes (formato de la Cloud API de Meta).
import { fetchar, dormir } from './red.js';

const corto = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Mensaje del motor → cuerpo para la API de WhatsApp.
// Un cliente con nombre de usuario de WhatsApp puede llegar sin teléfono, solo con su
// identificador de Meta (BSUID, por ejemplo "DO.1234..."). A ese se le escribe con "recipient".
export const esTelefono = (id) => /^\d+$/.test(String(id || ''));

export function aWhatsApp(telefono, m) {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', ...(esTelefono(telefono) ? { to: telefono } : { recipient: telefono }) };
  if (m.tipo === 'texto') return { ...base, type: 'text', text: { body: m.texto, preview_url: false } };
  if (m.tipo === 'ubicacion') {
    return { ...base, type: 'location', location: { latitude: m.lat, longitude: m.lng, name: m.nombre, address: m.direccion } };
  }
  if (m.tipo === 'botones') {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: corto(m.texto, 1024) },
        action: { buttons: m.botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: corto(b.titulo, 20) } })) },
      },
    };
  }
  if (m.tipo === 'lista') {
    return {
      ...base, type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: corto(m.texto, 1024) },
        action: { button: corto(m.boton, 20), sections: [{ title: 'Productos', rows: m.filas.slice(0, 10).map((f) => ({ id: f.id, title: corto(f.titulo, 24) })) }] },
      },
    };
  }
  throw new Error(`Tipo de mensaje desconocido: ${m.tipo}`);
}

// Si WhatsApp frena por mandar muchos mensajes seguidos al mismo cliente (429),
// se espera y se reintenta: 2, 5 y 10 segundos.
const ESPERAS_429 = [2000, 5000, 10000];

export async function enviar(config, cuerpo) {
  for (let intento = 0; ; intento++) {
    const r = await fetchar(`${config.d360Url}/messages`, {
      method: 'POST',
      headers: { 'D360-API-KEY': config.d360Clave, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    if (r.ok) return r.json().catch(() => ({}));
    const detalle = await r.text().catch(() => '');
    if (r.status === 429 && intento < ESPERAS_429.length) { await dormir(ESPERAS_429[intento]); continue; }
    const e = new Error(`360dialog respondió ${r.status}: ${detalle}`);
    e.status = r.status;
    throw e;
  }
}

// Descarga un archivo (foto/PDF) que mandó el cliente. Devuelve { base64, tipo } o null.
export async function descargarMedia(config, mediaId) {
  const info = await fetchar(`${config.d360Url}/${mediaId}`, { headers: { 'D360-API-KEY': config.d360Clave } });
  if (!info.ok) return null;
  const { url, mime_type: tipo } = await info.json();
  // 360dialog pide cambiar el host de Meta por el suyo y mandar la misma clave.
  const urlD360 = url.replace(/^https:\/\/lookaside\.fbsbx\.com/, config.d360Url);
  const archivo = await fetchar(urlD360, { headers: { 'D360-API-KEY': config.d360Clave } });
  if (!archivo.ok) return null;
  const buf = Buffer.from(await archivo.arrayBuffer());
  return { base64: buf.toString('base64'), tipo };
}

// Webhook de WhatsApp → lista de sucesos simples.
//   { tipo: 'mensaje', telefono, nombre, entrada, mediaId }
//   { tipo: 'eco', telefono }            (Verónica escribió desde la app: coexistencia)
//   { tipo: 'estado', telefono, estado, error }   (entregado, leído, fallido)
//   { tipo: 'calidad', calidad, evento }  (cambio de la calificación del número)
export function leerWebhook(cuerpo) {
  const sucesos = [];
  for (const entry of cuerpo?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const nombres = Object.fromEntries((v.contacts || []).flatMap((c) => [[c.wa_id, c.profile?.name], [c.user_id, c.profile?.name]]).filter(([k]) => k));
      if (change.field === 'messages') {
        for (const msg of v.messages || []) {
          const quien = msg.from || msg.from_user_id;
          // Los chats que vienen de un anuncio de clic a WhatsApp traen "referral".
          if (quien) sucesos.push({ tipo: 'mensaje', telefono: quien, nombre: nombres[quien] || null, anuncio: Boolean(msg.referral), ...entradaDe(msg) });
        }
        for (const st of v.statuses || []) {
          sucesos.push({ tipo: 'estado', telefono: st.recipient_id || st.recipient_user_id, estado: st.status, error: st.errors?.[0]?.title || null });
        }
      }
      if (change.field === 'smb_message_echoes') {
        for (const eco of v.message_echoes || []) {
          const quien = eco.to || eco.to_user_id;
          if (quien) sucesos.push({ tipo: 'eco', telefono: quien });
        }
      }
      if (change.field === 'phone_number_quality_update') {
        sucesos.push({ tipo: 'calidad', calidad: v.current_limit || v.event || null, evento: v.event || null, detalle: v });
      }
    }
  }
  return sucesos;
}

function entradaDe(msg) {
  switch (msg.type) {
    case 'text': return { entrada: { tipo: 'texto', texto: msg.text?.body || '' } };
    case 'interactive': {
      const r = msg.interactive?.button_reply || msg.interactive?.list_reply || {};
      return { entrada: { tipo: msg.interactive?.type === 'list_reply' ? 'lista' : 'boton', id: r.id, texto: r.title } };
    }
    case 'button': return { entrada: { tipo: 'texto', texto: msg.button?.text || '' } };
    case 'audio': return { entrada: { tipo: 'audio' }, mediaId: msg.audio?.id };
    case 'image': return { entrada: { tipo: 'imagen', texto: msg.image?.caption || '' }, mediaId: msg.image?.id };
    case 'document': return { entrada: { tipo: 'documento', texto: msg.document?.caption || '' }, mediaId: msg.document?.id };
    case 'location': return { entrada: { tipo: 'texto', texto: 'ubicación' } };
    default: return { entrada: { tipo: 'texto', texto: '' } };
  }
}
