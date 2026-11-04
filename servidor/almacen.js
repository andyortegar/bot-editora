// Almacén en un archivo JSON (suficiente para ~100 chats al día).
// Se escribe con un archivo temporal + rename para no dejarlo a medias si el servidor se cae.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const VACIO = () => ({
  chats: {},          // telefono -> { nombre, estado (del motor), historial, pase, resultado, ... }
  cola: [],           // telefonos en espera de Verónica
  telegram: { colas: {} },   // chat de Telegram -> id del mensaje fijado con la cola
  calidad: [],        // historial de la calificación de calidad del número
  eventos: [],        // registro para estadísticas: { tipo, telefono, fecha, ... }
});

export function crearAlmacen(ruta) {
  let datos = VACIO();
  if (ruta && existsSync(ruta)) {
    try { datos = { ...VACIO(), ...JSON.parse(readFileSync(ruta, 'utf8')) }; } catch { /* archivo dañado: empieza vacío */ }
    if (!datos.telegram.colas) datos.telegram = { colas: {} };
  }
  const guardar = () => {
    if (!ruta) return;
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(`${ruta}.tmp`, JSON.stringify(datos));
    renameSync(`${ruta}.tmp`, ruta);
  };
  return {
    datos,
    guardar,
    chat(telefono) {
      if (!datos.chats[telefono]) datos.chats[telefono] = { telefono, nombre: null, estado: null, historial: [], pase: null, resultado: null, usosIA: 0 };
      return datos.chats[telefono];
    },
    registrar(evento) {
      datos.eventos.push({ fecha: new Date().toISOString(), ...evento });
      if (datos.eventos.length > 50000) datos.eventos.splice(0, 10000);
    },
  };
}
