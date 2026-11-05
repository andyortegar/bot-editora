// Servidor del bot de Editora Ortega.  Uso: node servidor/index.js
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { cargarEnv, leerConfig } from './config.js';
import { crearAlmacen } from './almacen.js';
import { crearApp } from './app.js';
import { panelPrincipal, panelEstadisticas } from './panel.js';

export function crearServidor({ config, almacen, app }) {
  const iguales = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const leerCuerpo = (req) => new Promise((ok, mal) => {
    let datos = '';
    req.on('data', (c) => { datos += c; if (datos.length > 2e6) req.destroy(); });
    req.on('end', () => ok(datos));
    req.on('error', mal);
  });

  const autorizado = (req) => {
    if (!config.panelClave) return false;
    const [tipo, valor] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Basic' || !valor) return false;
    return iguales(Buffer.from(valor, 'base64').toString(), `${config.panelUsuario}:${config.panelClave}`);
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const responder = (codigo, cuerpo = '', tipo = 'text/plain; charset=utf-8') => { res.writeHead(codigo, { 'Content-Type': tipo }); res.end(cuerpo); };
    try {
      if (url.pathname === '/salud') return responder(200, 'ok');
      // La dirección sola (panel.editoraortega.com) lleva al panel.
      if (url.pathname === '/' || url.pathname === '/panel/') { res.writeHead(302, { Location: '/panel' }); return res.end(); }

      // 360dialog envía aquí los mensajes. La ruta lleva un secreto para que nadie más la use.
      if (req.method === 'POST' && url.pathname === `/webhook/whatsapp/${process.env.WEBHOOK_SECRETO || ''}` && process.env.WEBHOOK_SECRETO) {
        const cuerpo = JSON.parse((await leerCuerpo(req)) || '{}');
        responder(200, 'ok'); // se responde enseguida y se procesa después
        app.whatsapp(cuerpo).catch((e) => console.error('webhook', e));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/webhook/telegram') {
        if (config.telegramSecreto && req.headers['x-telegram-bot-api-secret-token'] !== config.telegramSecreto) return responder(403);
        const update = JSON.parse((await leerCuerpo(req)) || '{}');
        responder(200, 'ok');
        // Quien toca Iniciar en el bot recibe su número de chat (para ponerlo en el .env).
        const m = update.message;
        if (m?.text?.startsWith('/start') && config.telegramToken) {
          fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: m.chat.id, text: `Listo. Su número de chat es ${m.chat.id}. Envíeselo a Andy para activar los avisos.` }),
          }).catch(() => {});
        }
        app.telegram(update).catch((e) => console.error('telegram', e));
        return;
      }

      if (url.pathname.startsWith('/panel')) {
        if (!autorizado(req)) {
          res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Panel Editora Ortega"' });
          return res.end('Necesita usuario y clave.');
        }
        if (req.method === 'GET' && url.pathname === '/panel') return responder(200, panelPrincipal(almacen.datos), 'text/html; charset=utf-8');
        if (req.method === 'GET' && url.pathname === '/panel/estadisticas') return responder(200, panelEstadisticas(almacen.datos), 'text/html; charset=utf-8');
        if (req.method === 'POST') {
          const f = new URLSearchParams(await leerCuerpo(req));
          if (url.pathname === '/panel/resultado') app.marcarResultado(f.get('telefono'), f.get('estado'), f.get('monto'), f.get('motivo'));
          if (url.pathname === '/panel/terminar') await app.terminar(f.get('telefono'));
          res.writeHead(303, { Location: '/panel' });
          return res.end();
        }
      }
      responder(404, 'No encontrado');
    } catch (e) {
      console.error(e);
      if (!res.headersSent) responder(500, 'Error');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cargarEnv();
  const config = leerConfig();
  const almacen = crearAlmacen(config.datos);
  const app = crearApp({ config, almacen });
  crearServidor({ config, almacen, app }).listen(config.puerto, () => console.log(`Bot de Editora Ortega escuchando en el puerto ${config.puerto}`));
  setInterval(() => app.revisarEsperas().catch((e) => console.error('esperas', e)), 5 * 60 * 1000);
}
