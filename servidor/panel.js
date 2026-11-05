// Panel web para Verónica y el dueño: cola, clientes del día, resultados y estadísticas.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rd$ = (n) => (n == null ? '—' : `RD$${Math.round(n).toLocaleString('en-US')}`);
const hora = (iso) => (iso ? new Date(iso).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'short', timeStyle: 'short' }) : '—');

const esTel = (t) => /^\d+$/.test(String(t || ''));
const contacto = (t) => (esTel(t) ? `<a href="https://wa.me/${esc(t)}">+${esc(t)}</a>` : '<span class="suave">usuario sin número visible</span>');

const ESTILO = `
:root{--papel:#f4f6f7;--hoja:#fff;--tinta:#14212b;--suave:#5a6b78;--linea:#d9e0e5;--cian:#00799e;--alta:#c62828;--media:#b26a00;--baja:#2e7d32}
@media (prefers-color-scheme:dark){:root{--papel:#0f171d;--hoja:#17222a;--tinta:#e6edf1;--suave:#93a5b2;--linea:#26343e;--cian:#4cc3e6;--alta:#ef5350;--media:#ffb74d;--baja:#81c784;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--papel);color:var(--tinta);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px max(16px,env(safe-area-inset-left)) 32px}
main{max-width:1100px;margin:0 auto;display:grid;gap:16px}nav{display:flex;gap:16px;flex-wrap:wrap;align-items:baseline}nav a{color:var(--cian);font-weight:600}
h1{margin:0;font-size:1.4rem}h2{margin:0 0 8px;font-size:1.05rem}section{background:var(--hoja);border:1px solid var(--linea);border-radius:12px;padding:14px;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--linea);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--suave)}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600}.alta{color:var(--alta)}.media{color:var(--media)}.baja{color:var(--baja)}
.cifras{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.cifra b{display:block;font-size:1.6rem}.cifra span{color:var(--suave);font-size:13px}
form{display:flex;gap:6px;flex-wrap:wrap}select,input,button{font:inherit;padding:5px 8px;border-radius:8px;border:1px solid var(--linea);background:var(--papel);color:var(--tinta)}button{cursor:pointer;background:var(--cian);color:var(--hoja);border-color:var(--cian)}
.suave{color:var(--suave)}`;

const pagina = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)} · Editora Ortega</title><style>${ESTILO}</style></head>
<body><main><nav><h1>${esc(titulo)}</h1><a href="/panel">Cola y clientes</a><a href="/panel/estadisticas">Estadísticas</a></nav>${cuerpo}</main></body></html>`;

function formResultado(t, r) {
  const op = (v) => `<option${r?.estado === v ? ' selected' : ''}>${v}</option>`;
  return `<form method="post" action="/panel/resultado"><input type="hidden" name="telefono" value="${esc(t)}">
<select name="estado" aria-label="Resultado">${['en atención', 'cotizado', 'vendido', 'no compró'].map(op).join('')}</select>
<input name="monto" placeholder="Monto RD$" size="9" value="${esc(r?.monto ?? '')}" aria-label="Monto">
<input name="motivo" placeholder="Motivo (si no compró)" size="14" value="${esc(r?.motivo ?? '')}" aria-label="Motivo">
<button>Guardar</button></form>`;
}

export function panelPrincipal(datos) {
  const { cola, chats } = datos;
  const filaCola = cola.map((t, i) => {
    const c = chats[t], p = c.pase || {};
    return `<tr><td>${i + 1}</td><td><b>${esc(c.nombre || '')}</b><br>${contacto(t)}</td>
<td>${(p.items || []).map((x) => esc(x.descripcion)).join('<br>') || '—'}</td><td><b>${rd$(p.ticket)}</b></td>
<td><span class="chip ${esc(p.urgencia || '')}">${esc(p.urgencia || 'sin fecha')}</span><br><span class="suave">${esc(p.fechaTexto || '')}</span></td>
<td>${esc(p.motivo || '')}<br><span class="suave">${esc(p.origen || '')}</span></td>
<td><form method="post" action="/panel/terminar"><input type="hidden" name="telefono" value="${esc(t)}"><button>Terminado</button></form></td></tr>`;
  }).join('');
  const recientes = Object.values(chats).filter((c) => c.pase).sort((a, b) => (b.pase.fecha || '').localeCompare(a.pase.fecha || '')).slice(0, 60);
  const filaRes = recientes.map((c) => `<tr><td>${hora(c.pase.fecha)}</td><td>${esc(c.nombre || '')}<br>${contacto(c.telefono)}</td>
<td>${rd$(c.pase.ticket)}</td><td>${(c.comprobantes || []).map((x) => `${rd$(x.monto)} · ${esc(x.estado)}`).join('<br>') || '—'}</td><td>${formResultado(c.telefono, c.resultado)}</td></tr>`).join('');
  return pagina('Panel del bot', `
<section><h2>En espera de Verónica (${cola.length})</h2>${cola.length ? `<table><thead><tr><th>#</th><th>Cliente</th><th>Pedido</th><th>Ticket</th><th>Urgencia</th><th>Motivo</th><th></th></tr></thead><tbody>${filaCola}</tbody></table>` : '<p class="suave">Nadie en espera.</p>'}</section>
<section><h2>Clientes pasados a Verónica</h2><p class="suave">Marque el resultado de cada uno para medir cuántos compran.</p>${recientes.length ? `<table><thead><tr><th>Pase</th><th>Cliente</th><th>Ticket</th><th>Comprobantes</th><th>Resultado</th></tr></thead><tbody>${filaRes}</tbody></table>` : '<p class="suave">Todavía no hay clientes.</p>'}</section>`);
}

export function calcular(datos, desde) {
  const ev = datos.eventos.filter((e) => e.fecha >= desde);
  const cuenta = (f) => ev.filter(f).length;
  const porClave = (tipo, clave) => ev.filter((e) => e.tipo === tipo).reduce((m, e) => ((m[e[clave] || '—'] = (m[e[clave] || '—'] || 0) + 1), m), {});
  const nuevos = cuenta((e) => e.tipo === 'chat_nuevo');
  const pases = cuenta((e) => e.tipo === 'pase');
  const vendidos = Object.values(datos.chats).filter((c) => c.resultado?.estado === 'vendido' && (c.resultado.fecha || '') >= desde);
  const montoVendido = vendidos.reduce((s, c) => s + (c.resultado.monto || 0), 0);
  return {
    nuevos, pases, curiosos: cuenta((e) => e.tipo === 'curioso'),
    vendidos: vendidos.length, montoVendido,
    conversion: nuevos ? vendidos.length / nuevos : 0,
    porOrigen: porClave('chat_nuevo', 'origen'), porMotivo: porClave('pase', 'motivo'),
    comprobantes: cuenta((e) => e.tipo === 'comprobante'),
    fallidos: cuenta((e) => e.tipo === 'envio_fallido'),
  };
}

export function panelEstadisticas(datos, ahora = new Date()) {
  const dias = (n) => new Date(ahora.getTime() - n * 86400000).toISOString();
  const s7 = calcular(datos, dias(7)), s30 = calcular(datos, dias(30));
  const tabla = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('') || '<tr><td colspan="2" class="suave">Sin datos</td></tr>';
  const cifra = (v, t) => `<div class="cifra"><b>${v}</b><span>${t}</span></div>`;
  const calidad = datos.calidad.slice(-10).reverse().map((c) => `<tr><td>${hora(c.fecha)}</td><td>${esc(c.evento || '')}</td><td>${esc(c.calidad || '')}</td></tr>`).join('');
  return pagina('Estadísticas', `
<section><h2>Últimos 7 días</h2><div class="cifras">${cifra(s7.nuevos, 'chats nuevos')}${cifra(s7.pases, 'pasados a Verónica')}${cifra(s7.curiosos, 'solo preguntaban')}${cifra(s7.vendidos, 'ventas marcadas')}${cifra(rd$(s7.montoVendido), 'vendido')}${cifra(`${(s7.conversion * 100).toFixed(1)}%`, 'conversión')}</div></section>
<section><h2>Últimos 30 días</h2><div class="cifras">${cifra(s30.nuevos, 'chats nuevos')}${cifra(s30.pases, 'pasados')}${cifra(s30.vendidos, 'ventas')}${cifra(rd$(s30.montoVendido), 'vendido')}${cifra(`${(s30.conversion * 100).toFixed(1)}%`, 'conversión')}${cifra(s30.comprobantes, 'comprobantes recibidos')}</div></section>
<section><h2>Origen de los chats (30 días)</h2><table><tbody>${tabla(s30.porOrigen)}</tbody></table></section>
<section><h2>Motivos de pase (30 días)</h2><table><tbody>${tabla(s30.porMotivo)}</tbody></table></section>
<section><h2>Calidad del número</h2>${calidad ? `<table><thead><tr><th>Fecha</th><th>Evento</th><th>Límite</th></tr></thead><tbody>${calidad}</tbody></table>` : '<p class="suave">Sin cambios registrados. Meta avisa solo cuando la calidad cambia.</p>'}${s30.fallidos ? `<p class="alta">${s30.fallidos} mensajes no se entregaron en 30 días.</p>` : ''}</section>`);
}
