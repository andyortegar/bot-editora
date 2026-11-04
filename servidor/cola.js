// Cola de atención: primero el ticket más alto; la urgencia solo desempata montos parecidos.
const PESO_URGENCIA = { alta: 3, media: 2, baja: 1 };

export function ordenarCola(telefonos, chats, margen = 0.15) {
  const datos = telefonos.map((t) => ({ t, ticket: chats[t]?.pase?.ticket || 0, urg: PESO_URGENCIA[chats[t]?.pase?.urgencia] || 0, desde: chats[t]?.pase?.fecha || '' }));
  datos.sort((a, b) => {
    const mayor = Math.max(a.ticket, b.ticket) || 1;
    if (Math.abs(a.ticket - b.ticket) / mayor < margen) {
      if (b.urg !== a.urg) return b.urg - a.urg;
      return a.desde.localeCompare(b.desde); // a igualdad, el que llegó primero
    }
    return b.ticket - a.ticket;
  });
  return datos.map((d) => d.t);
}
