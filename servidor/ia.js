// IA de apoyo (Claude Haiku). Solo extrae datos; nunca conversa con el cliente ni da precios.
import { fetchar } from './red.js';
import { CATALOGO } from '../src/config.js';

async function preguntar(config, contenido, maxTokens = 400) {
  const r = await fetchar('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': config.anthropicClave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.modeloIA, max_tokens: maxTokens, messages: [{ role: 'user', content: contenido }] }),
  });
  if (!r.ok) throw new Error(`Claude respondió ${r.status}`);
  const d = await r.json();
  const texto = (d.content || []).map((c) => c.text || '').join('');
  const json = texto.match(/\{[\s\S]*\}/);
  return json ? JSON.parse(json[0]) : null;
}

const PRODUCTOS = CATALOGO.map((p) => {
  const opciones = p.pasos.flatMap((s) => s.opciones.map((o) => `${s.campo}=${o.id}`)).join(', ');
  return `- ${p.id} (${p.lista})${opciones ? `: ${opciones}` : ''}`;
}).join('\n');

// Texto libre del cliente → datos estructurados.
export async function entender(config, texto, etapa) {
  const prompt = `Eres un extractor de datos para una imprenta de República Dominicana. NO respondas al cliente.
Productos válidos (id: opciones):
${PRODUCTOS}

El bot está en la etapa "${etapa}". Mensaje del cliente:
"""${texto.slice(0, 1000)}"""

Devuelve SOLO un JSON con esta forma (usa null si no aplica):
{"pedidos":[{"producto":"<id>","cantidad":<número o null>,"variante":"<id o null>","doblez":"<id o null>"}],
 "fecha":"<DD/MM si menciona una fecha concreta, o 'hoy', 'mañana', 'urgente', 'sin prisa', o null>",
 "quiere_persona":<true/false>, "quiere_ofertas":<true/false>, "si_no":"<si|no|null>"}
Si el producto no está en la lista, no lo incluyas en pedidos.`;
  return preguntar(config, prompt);
}

// Convierte lo que entendió la IA en un texto que las reglas del bot sí entienden.
export function textoCanonico(r) {
  if (!r) return null;
  if (r.quiere_persona) return 'quiero hablar con una persona';
  if (r.quiere_ofertas) return 'ofertas';
  const partes = [];
  for (const p of r.pedidos || []) {
    const prod = CATALOGO.find((x) => x.id === p.producto);
    if (!prod) continue;
    const trozos = [p.cantidad || '', prod.palabras[0]];
    for (const paso of prod.pasos) {
      const op = paso.opciones.find((o) => o.id === p[paso.campo]);
      if (op) trozos.push(op.texto.replace(/"/g, ''));
    }
    partes.push(trozos.join(' ').trim());
  }
  if (partes.length) return partes.join(' y ');
  if (r.fecha) return r.fecha;
  if (r.si_no) return r.si_no;
  return null;
}

// Foto o PDF de un cliente ya atendido → ¿es un comprobante de transferencia?
export async function leerComprobante(config, archivo) {
  const esPdf = archivo.tipo === 'application/pdf';
  const bloque = esPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivo.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: archivo.tipo || 'image/jpeg', data: archivo.base64 } };
  return preguntar(config, [
    bloque,
    {
      type: 'text',
      text: `¿Este archivo es un comprobante de transferencia o depósito bancario (República Dominicana)?
Devuelve SOLO un JSON: {"es_comprobante":true/false,"tipo":"comprobante|arte|otro","monto":<número en RD$ o null>,"banco":"<nombre o null>","fecha":"<DD/MM/AAAA o null>","referencia_ultimos4":"<últimos 4 caracteres de la referencia o null>"}
No incluyas números de cuenta ni nombres de personas.`,
    },
  ]);
}
