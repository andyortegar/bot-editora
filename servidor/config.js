// Configuración del servidor, leída de variables de entorno (archivo .env en el servidor).
import { readFileSync, existsSync } from 'node:fs';

// Carga simple de un archivo .env (CLAVE=valor por línea), sin dependencias.
export function cargarEnv(ruta = '.env') {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export function leerConfig(env = process.env) {
  return {
    puerto: Number(env.PUERTO || 3000),
    datos: env.ARCHIVO_DATOS || 'datos/estado.json',
    // 360dialog (API de WhatsApp)
    d360Clave: env.D360_API_KEY || '',
    d360Url: env.D360_URL || 'https://waba-v2.360dialog.io',
    // Telegram (avisos a Verónica)
    telegramToken: env.TELEGRAM_TOKEN || '',
    telegramChat: env.TELEGRAM_CHAT_ID || '',
    telegramSecreto: env.TELEGRAM_SECRETO || '',
    // Chats que reciben una copia de la cola fijada y las alertas de seguimiento (el dueño)
    telegramSupervisores: (env.TELEGRAM_CHAT_SUPERVISOR || '').split(',').map((x) => x.trim()).filter(Boolean),
    // Minutos de espera (en horario) después de los cuales se avisa al dueño
    alertaEsperaMin: Number(env.ALERTA_ESPERA_MIN || 30),
    // Claude (IA para texto libre y comprobantes)
    anthropicClave: env.ANTHROPIC_API_KEY || '',
    modeloIA: env.MODELO_IA || 'claude-haiku-5-5',
    maxUsosIA: Number(env.MAX_USOS_IA || 4),
    // Panel web
    panelUsuario: env.PANEL_USUARIO || 'veronica',
    panelClave: env.PANEL_CLAVE || '',
    // Cola: montos a menos de este porcentaje se consideran parecidos y desempata la urgencia
    margenEmpate: Number(env.MARGEN_EMPATE || 0.15),
  };
}
