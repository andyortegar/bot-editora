// Acceso a la red, reemplazable en las pruebas.
let impl = (...a) => globalThis.fetch(...a);
export const fetchar = (...a) => impl(...a);
export function usarFetch(f) { impl = f; }
