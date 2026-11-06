// Acceso a la red y esperas, reemplazables en las pruebas.
let impl = (...a) => globalThis.fetch(...a);
let implDormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const fetchar = (...a) => impl(...a);
export const dormir = (ms) => implDormir(ms);
export function usarFetch(f) { impl = f; }
export function usarDormir(f) { implDormir = f; }
