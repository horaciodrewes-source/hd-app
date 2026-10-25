// App interna HD Máquinas Ópticas — vistas y navegación.

// ---------- Utilidades ----------

const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtFecha(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
const horaActual = () => new Date().toTimeString().slice(0, 5);
const aMinutos = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmtHoras = min => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`;
const diasEntre = (desde, hasta) => Math.round((new Date(hasta + 'T12:00:00') - new Date(desde + 'T12:00:00')) / 86400000);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

const usuario = id => DB.todos('usuarios').find(u => u.id === id);
const nombre = id => usuario(id)?.nombre ?? id;
const nombreCorto = id => nombre(id).split(' ')[0];
const usuariosActivos = () => DB.todos('usuarios').filter(u => u.activo);

function datosForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function opciones(lista, actual) {
  return lista.map(([v, t]) => `<option value="${esc(v)}"${v === actual ? ' selected' : ''}>${esc(t)}</option>`).join('');
}
function badgeEstado(estado) {
  const mapa = {
    pendiente: ['warn', 'Pendiente'],
    pendiente_sector: ['warn', 'Pendiente (subdirector)'],
    pendiente_director: ['warn', 'Pendiente (Horacio)'],
    aprobado: ['ok', 'Aprobado'],
    rechazado: ['bad', 'Rechazado'],
    programada: ['warn', 'Programada'],
    realizada: ['ok', 'Realizada'],
    cancelada: ['bad', 'Cancelada'],
  };
  const [cls, txt] = mapa[estado] || ['', estado];
  return `<span class="badge ${cls}">${txt}</span>`;
}

// ---------- Sesión ----------

let yo = null;
function iniciarSesion(id) {
  try { sessionStorage.setItem('hdapp-usuario', id); } catch (e) { /* sin almacenamiento */ }
  yo = usuario(id);
  location.hash = '#inicio';
  render();
}
function cerrarSesion() {
  try { sessionStorage.removeItem('hdapp-usuario'); } catch (e) { /* sin almacenamiento */ }
  yo = null;
  location.hash = '';
  render();
}

// ---------- Reglas de asistencia y vacaciones ----------

function fichajesDe(uid, fecha) {
  return DB.todos('fichajes').filter(f => f.usuario === uid && f.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora));
}
function minutosTrabajados(lista) {
  let total = 0, inicio = null;
  for (const f of lista) {
    if (f.tipo === 'entrada') inicio = aMinutos(f.hora);
    else if (inicio !== null) { total += aMinutos(f.hora) - inicio; inicio = null; }
  }
  return total;
}
function proximoTipo(uid) {
  const hoy = fichajesDe(uid, hoyISO());
  return hoy.length && hoy[hoy.length - 1].tipo === 'entrada' ? 'salida' : 'entrada';
}
function registrarFichaje(tipoOrigen) {
  const tipo = proximoTipo(yo.id);
  DB.agregar('fichajes', { usuario: yo.id, fecha: hoyISO(), hora: horaActual(), tipo, origen: tipoOrigen });
  toast(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada a las ${horaActual()}`);
  render();
}

function resumenMes(uid, mes) {
  const cfg = DB.config;
  const limite = aMinutos(cfg.horaEntrada) + Number(cfg.toleranciaMin);
  const fichajes = DB.todos('fichajes').filter(f => f.usuario === uid && f.fecha.startsWith(mes));
  const dias = [...new Set(fichajes.map(f => f.fecha))].sort();
  let minutos = 0, tardes = 0;
  const detalle = dias.map(d => {
    const lista = fichajesDe(uid, d);
    const min = minutosTrabajados(lista);
    const primera = lista.find(f => f.tipo === 'entrada');
    const tarde = primera && aMinutos(primera.hora) > limite;
    minutos += min;
    if (tarde) tardes++;
    return { fecha: d, lista, minutos: min, tarde };
  });
  const aus = DB.todos('ausencias').filter(a => a.usuario === uid && a.estado === 'aprobado' && a.fecha.startsWith(mes));
  let vac = 0;
  for (const v of DB.todos('vacaciones').filter(v => v.usuario === uid && v.estado === 'aprobado')) {
    for (let d = v.desde; d <= v.hasta; d = sumarDias(d, 1)) if (d.startsWith(mes)) vac++;
  }
  return {
    dias: dias.length, minutos, tardes,
    ausencias: aus.filter(a => a.tipo === 'ausencia').length,
    licencias: aus.filter(a => a.tipo === 'licencia').length,
    vacaciones: vac, detalle,
  };
}

// Ley de Contrato de Trabajo, art. 150: días corridos según antigüedad al 31/12 del año
function diasVacacionesQueCorresponden(u, periodo) {
  const anios = periodo - Number(u.ingreso.slice(0, 4));
  if (anios <= 5) return 14;
  if (anios <= 10) return 21;
  if (anios <= 20) return 28;
  return 35;
}
// El período de vacaciones del año N va del 1/10/N al 30/4/N+1
function periodoDe(iso) {
  const [a, m] = iso.split('-').map(Number);
  return m >= 10 ? a : a - 1;
}
function diasUsados(uid, periodo, excluirId) {
  return DB.todos('vacaciones')
    .filter(v => v.usuario === uid && v.id !== excluirId && v.estado !== 'rechazado' && periodoDe(v.desde) === periodo)
    .reduce((s, v) => s + diasEntre(v.desde, v.hasta) + 1, 0);
}
function dentroDelPeriodoLegal(iso) {
  const m = Number(iso.slice(5, 7));
  return m >= 10 || m <= 4;
}
function estadoInicialVacaciones(u) {
  if (u.rol === 'director') return 'aprobado';
  const hayEtapaSector = usuariosActivos().some(s => s.id !== u.id && puede(s, 'aprobarVacacionesSectorDe', u));
  return hayEtapaSector ? 'pendiente_sector' : 'pendiente_director';
}

function pendientesPara(u) {
  const aus = DB.todos('ausencias').filter(a => a.estado === 'pendiente' && puede(u, 'aprobarAusenciaDe', usuario(a.usuario)));
  const vac = DB.todos('vacaciones').filter(v =>
    (v.estado === 'pendiente_sector' && (puede(u, 'aprobarVacacionesSectorDe', usuario(v.usuario)) || puede(u, 'aprobarVacacionesFinal'))) ||
    (v.estado === 'pendiente_director' && puede(u, 'aprobarVacacionesFinal')));
  const cor = DB.todos('correcciones').filter(c => c.estado === 'pendiente' && puede(u, 'aprobarCorreccion') && (c.usuario !== u.id || u.rol === 'director'));
  return { aus, vac, cor, total: aus.length + vac.length + cor.length };
}

// ---------- Navegación ----------

const RUTAS = [
  { id: 'inicio', titulo: 'Inicio', seccion: 'Mi día', vista: vistaInicio },
  { id: 'fichar', titulo: 'Fichar entrada / salida', seccion: 'Mi día', vista: vistaFichar },
  { id: 'tareas', titulo: 'Tareas', seccion: 'Mi día', vista: vistaTareas },
  { id: 'cartelera', titulo: 'Cartelera', seccion: 'Mi día', vista: vistaCartelera },
  { id: 'asistencia', titulo: 'Asistencia', seccion: 'Personal', vista: vistaAsistencia },
  { id: 'ausencias', titulo: 'Ausencias y licencias', seccion: 'Personal', vista: vistaAusencias },
  { id: 'vacaciones', titulo: 'Vacaciones', seccion: 'Personal', vista: vistaVacaciones },
  { id: 'recibos', titulo: 'Recibos de sueldo', seccion: 'Personal', vista: vistaRecibos },
  { id: 'precios', titulo: 'Lista de precios', seccion: 'Trabajo', vista: vistaPrecios },
  { id: 'material', titulo: 'Folletos y material', seccion: 'Trabajo', vista: vistaMaterial },
  { id: 'agenda', titulo: 'Agenda de campo', seccion: 'Trabajo', vista: vistaAgenda },
  { id: 'recordatorios', titulo: 'Recordatorios', seccion: 'Trabajo', vista: vistaRecordatorios },
  { id: 'aprobaciones', titulo: 'Aprobaciones', seccion: 'Administración', vista: vistaAprobaciones, visible: u => u.rol !== 'empleado' },
  { id: 'qr', titulo: 'Código QR de la entrada', seccion: 'Administración', vista: vistaQR, visible: u => puede(u, 'administrarUsuarios') },
  { id: 'usuarios', titulo: 'Usuarios y ajustes', seccion: 'Administración', vista: vistaUsuarios, visible: u => puede(u, 'administrarUsuarios') },
];

function render() {
  const app = $('#app');
  const nav = $('#sidenav');
  if (!yo) {
    $('#topbar').hidden = true;
    nav.hidden = true;
    app.innerHTML = vistaLogin();
    app.querySelectorAll('[data-login]').forEach(b => b.onclick = () => iniciarSesion(b.dataset.login));
    return;
  }
  const rutas = RUTAS.filter(r => !r.visible || r.visible(yo));
  const actual = rutas.find(r => '#' + r.id === location.hash) || rutas[0];
  const pend = pendientesPara(yo).total;

  $('#topbar').hidden = false;
  nav.hidden = false;
  $('#user-chip').textContent = nombreCorto(yo.id);
  let secc = '';
  nav.innerHTML = rutas.map(r => {
    const cab = r.seccion !== secc ? `<div class="nav-section">${(secc = r.seccion)}</div>` : '';
    const extra = r.id === 'aprobaciones' && pend ? ` <span class="badge warn">${pend}</span>` : '';
    return `${cab}<a href="#${r.id}" class="${r === actual ? 'active' : ''}">${esc(r.titulo)}${extra}</a>`;
  }).join('') + `<div class="nav-section">Sesión</div><a href="#" id="salir">Salir (${esc(nombreCorto(yo.id))})</a>`;
  $('#salir').onclick = e => { e.preventDefault(); cerrarSesion(); };
  nav.classList.remove('open');

  detenerEscaner();
  app.innerHTML = actual.vista();
  conectar[actual.id]?.();
}

// Cada vista devuelve HTML; `conectar[id]` engancha los eventos de esa vista.
const conectar = {};

// ---------- Login ----------

function vistaLogin() {
  return `<div class="login card">
    <h1>HD Interna</h1>
    <p class="muted">En la versión final cada persona entra con su cuenta de Google. En esta prueba, elegí con quién querés entrar para ver qué puede hacer cada rol.</p>
    ${usuariosActivos().map(u => `<button class="user-btn" data-login="${u.id}"><span>${esc(u.nombre)}</span><small>${ROLES[u.rol]}</small></button>`).join('')}
  </div>`;
}

// ---------- Inicio ----------

function vistaInicio() {
  const hoy = fichajesDe(yo.id, hoyISO());
  const pend = pendientesPara(yo);
  const tareas = DB.todos('tareas').filter(t => t.asignado === yo.id && !t.hecha);
  const novedades = [...DB.todos('novedades')].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 3);
  const recs = DB.todos('recordatorios').filter(r => puede(yo, 'verRecordatorio', r) && diasEntre(hoyISO(), r.vence) <= 15)
    .sort((a, b) => a.vence.localeCompare(b.vence));
  return `<h1>Hola, ${esc(nombreCorto(yo.id))}</h1>
  <div class="grid">
    <div class="card">
      <h3>Hoy</h3>
      ${hoy.length ? hoy.map(f => `<div>${f.tipo === 'entrada' ? 'Entrada' : 'Salida'}: <b>${f.hora}</b></div>`).join('') : '<p class="muted">Todavía no fichaste hoy.</p>'}
      <p></p>
      <a class="btn btn-primary" href="#fichar">Fichar ${proximoTipo(yo.id)}</a>
    </div>
    ${pend.total ? `<div class="card"><h3>Para aprobar</h3><div class="stat">${pend.total}</div><a href="#aprobaciones">Ver pedidos pendientes</a></div>` : ''}
    <div class="card">
      <h3>Mis tareas pendientes</h3>
      ${tareas.length ? tareas.map(t => `<div class="list-item">${esc(t.titulo)} <small>vence ${fmtFecha(t.vence)}</small></div>`).join('') : '<p class="muted">No tenés tareas pendientes.</p>'}
    </div>
  </div>
  ${recs.length ? `<h2>Próximos vencimientos</h2><div class="card">${recs.map(r => `<div class="list-item">${esc(r.titulo)} ${badgeVence(r.vence)}</div>`).join('')}</div>` : ''}
  <h2>Novedades</h2>
  <div class="card">${novedades.map(n => `<div class="list-item"><h3>${esc(n.titulo)}</h3><p>${esc(n.texto)}</p><small>${esc(nombre(n.autor))} · ${fmtFecha(n.fecha)}</small></div>`).join('') || '<p class="muted">Sin novedades.</p>'}</div>`;
}

// ---------- Fichar ----------

let escaner = null;
function detenerEscaner() {
  if (escaner) { escaner.stop().catch(() => {}); escaner = null; }
}

function vistaFichar() {
  const tipo = proximoTipo(yo.id);
  const hoy = fichajesDe(yo.id, hoyISO());
  const mias = DB.todos('correcciones').filter(c => c.usuario === yo.id).slice(-5).reverse();
  return `<h1>Fichar ${tipo}</h1>
  <div class="card">
    <p>Escaneá el código QR que está en la entrada de HD. Se guarda la fecha y la hora automáticamente.</p>
    <div id="reader"></div>
    <div class="row" style="margin-top:12px">
      <button class="primary" id="abrir-camara">Abrir cámara</button>
      <button id="simular">Simular escaneo (solo en la prueba)</button>
    </div>
    <div id="msg-scan"></div>
  </div>
  <div class="card">
    <h3>Mis fichajes de hoy</h3>
    ${hoy.length ? hoy.map(f => `<div>${f.tipo === 'entrada' ? 'Entrada' : 'Salida'}: <b>${f.hora}</b>${f.corregido ? ' <span class="badge">corregido</span>' : ''}</div>`).join('') : '<p class="muted">Sin fichajes todavía.</p>'}
  </div>
  <div class="card">
    <h3>¿Te olvidaste de fichar?</h3>
    <p class="muted">Pedí una corrección. La aprueba Horacio o Katia y queda registrada como corregida.</p>
    <form class="stack" id="form-correccion">
      <div class="grid">
        <label>Fecha <input type="date" name="fecha" required max="${hoyISO()}" value="${hoyISO()}"></label>
        <label>Hora <input type="time" name="hora" required></label>
        <label>Tipo <select name="tipo">${opciones([['entrada', 'Entrada'], ['salida', 'Salida']])}</select></label>
      </div>
      <label>Motivo <input name="motivo" required placeholder="Ej.: me olvidé el celular"></label>
      <div><button class="primary">Pedir corrección</button></div>
    </form>
    ${mias.length ? `<h3 style="margin-top:16px">Mis pedidos de corrección</h3>${mias.map(c => `<div class="list-item">${fmtFecha(c.fecha)} ${c.hora} (${c.tipo}) ${badgeEstado(c.estado)}</div>`).join('')}` : ''}
  </div>`;
}
conectar.fichar = () => {
  const msg = $('#msg-scan');
  const esperado = 'HDAPP|' + DB.config.tokenQR;
  $('#simular').onclick = () => registrarFichaje('simulado');
  $('#abrir-camara').onclick = () => {
    if (!window.Html5Qrcode) { msg.innerHTML = '<div class="notice bad">No se pudo cargar el lector de QR. Revisá la conexión.</div>'; return; }
    detenerEscaner();
    escaner = new Html5Qrcode('reader');
    escaner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, texto => {
      if (texto === esperado) {
        detenerEscaner();
        registrarFichaje('qr');
      } else {
        msg.innerHTML = '<div class="notice bad">Ese código QR no es el de la entrada de HD.</div>';
      }
    }).catch(() => { msg.innerHTML = '<div class="notice bad">No se pudo abrir la cámara. Revisá que el navegador tenga permiso.</div>'; });
  };
  $('#form-correccion').onsubmit = e => {
    e.preventDefault();
    DB.agregar('correcciones', { ...datosForm(e.target), usuario: yo.id, estado: 'pendiente', creado: hoyISO() });
    toast('Pedido de corrección enviado');
    render();
  };
};

// ---------- Código QR (administración) ----------

function vistaQR() {
  return `<h1>Código QR de la entrada</h1>
  <div class="card">
    <p class="no-print">Imprimí este código y pegalo en la entrada. Si alguien le saca una foto para fichar desde afuera, generá uno nuevo: el anterior deja de funcionar.</p>
    <div style="text-align:center">
      <h2>HD Máquinas Ópticas · Fichaje</h2>
      <div id="qr-box"></div>
      <p class="muted">Escaneá desde la app HD Interna al llegar y al irte.</p>
    </div>
    <div class="row no-print">
      <button class="primary" onclick="window.print()">Imprimir</button>
      <button class="bad" id="nuevo-qr">Generar un código nuevo</button>
    </div>
  </div>`;
}
conectar.qr = () => {
  if (window.QRCode) new QRCode($('#qr-box'), { text: 'HDAPP|' + DB.config.tokenQR, width: 240, height: 240 });
  else $('#qr-box').textContent = 'No se pudo cargar el generador de QR.';
  $('#nuevo-qr').onclick = () => {
    if (!confirm('¿Generar un código nuevo? El que está impreso deja de funcionar.')) return;
    DB.setConfig({ tokenQR: 'HD-' + nuevoId() });
    toast('Código nuevo generado. Imprimilo y reemplazá el anterior.');
    render();
  };
};

// ---------- Asistencia ----------

let mesAsistencia = hoyISO().slice(0, 7);
let detalleAsistencia = null;

function vistaAsistencia() {
  const visibles = usuariosActivos().filter(u => puede(yo, 'verAsistenciaDe', u));
  const filas = visibles.map(u => ({ u, r: resumenMes(u.id, mesAsistencia) }));
  const [a, m] = mesAsistencia.split('-');
  const det = detalleAsistencia && visibles.find(u => u.id === detalleAsistencia) ? detalleAsistencia : (visibles.length === 1 ? visibles[0].id : null);
  const detR = det && resumenMes(det, mesAsistencia);
  return `<h1>Asistencia de ${MESES[Number(m) - 1]} ${a}</h1>
  <div class="card row">
    <label style="max-width:220px">Mes <input type="month" id="mes" value="${mesAsistencia}"></label>
    ${puede(yo, 'exportarAsistencia') ? '<button id="exportar">Descargar para Excel (CSV)</button>' : ''}
  </div>
  <div class="card table-wrap">
    <table>
      <thead><tr><th>Persona</th><th class="num">Días</th><th class="num">Horas</th><th class="num">Llegadas tarde</th><th class="num">Ausencias</th><th class="num">Licencias</th><th class="num">Vacaciones</th><th></th></tr></thead>
      <tbody>${filas.map(({ u, r }) => `<tr>
        <td>${esc(u.nombre)}</td><td class="num">${r.dias}</td><td class="num">${fmtHoras(r.minutos)}</td>
        <td class="num">${r.tardes}</td><td class="num">${r.ausencias}</td><td class="num">${r.licencias}</td><td class="num">${r.vacaciones}</td>
        <td><button data-detalle="${u.id}">Ver días</button></td></tr>`).join('')}</tbody>
    </table>
    <small>Llegada tarde: primera entrada después de las ${DB.config.horaEntrada} más ${DB.config.toleranciaMin} minutos de tolerancia.</small>
  </div>
  ${detR ? `<h2>Detalle de ${esc(nombre(det))}</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Fecha</th><th>Fichajes</th><th class="num">Horas</th><th></th></tr></thead>
    <tbody>${detR.detalle.map(d => `<tr><td>${fmtFecha(d.fecha)}</td>
      <td>${d.lista.map(f => `${f.tipo === 'entrada' ? '▶' : '■'} ${f.hora}${f.corregido ? '*' : ''}`).join(' &nbsp; ')}</td>
      <td class="num">${fmtHoras(d.minutos)}</td><td>${d.tarde ? '<span class="badge warn">tarde</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin fichajes este mes.</td></tr>'}</tbody>
  </table><small>▶ entrada · ■ salida · * corregido con aprobación</small></div>` : ''}`;
}
conectar.asistencia = () => {
  $('#mes').onchange = e => { mesAsistencia = e.target.value || mesAsistencia; render(); };
  document.querySelectorAll('[data-detalle]').forEach(b => b.onclick = () => { detalleAsistencia = b.dataset.detalle; render(); });
  const exp = $('#exportar');
  if (exp) exp.onclick = () => {
    const filas = [['Persona', 'Días trabajados', 'Horas', 'Llegadas tarde', 'Ausencias', 'Licencias', 'Días de vacaciones']];
    for (const u of usuariosActivos().filter(u => puede(yo, 'verAsistenciaDe', u))) {
      const r = resumenMes(u.id, mesAsistencia);
      filas.push([u.nombre, r.dias, (r.minutos / 60).toFixed(2).replace('.', ','), r.tardes, r.ausencias, r.licencias, r.vacaciones]);
    }
    const csv = '﻿' + filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `asistencia-${mesAsistencia}.csv`;
    a.click();
  };
};

// ---------- Ausencias y licencias ----------

function vistaAusencias() {
  const mias = DB.todos('ausencias').filter(a => a.usuario === yo.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `<h1>Ausencias y licencias</h1>
  <div class="card">
    <form class="stack" id="form-ausencia">
      <label>¿Qué necesitás? <select name="tipo">${opciones([['ausencia', 'Avisar que no voy a trabajar'], ['licencia', 'Pedir un día de licencia']])}</select></label>
      <label>Fecha <input type="date" name="fecha" required value="${hoyISO()}"></label>
      <label>Motivo <input name="motivo" required placeholder="Ej.: enfermedad, trámite, examen"></label>
      <label>Certificado o foto (opcional) <input type="file" name="adjunto" accept="image/*,application/pdf"></label>
      <div><button class="primary">Enviar</button></div>
    </form>
    <small>Lo aprueba ${yo.rol === 'empleado' ? 'tu subdirector u Horacio' : 'Horacio'}. Vas a ver la respuesta acá.</small>
  </div>
  <h2>Mis pedidos</h2>
  <div class="card">${mias.map(a => `<div class="list-item"><b>${a.tipo === 'ausencia' ? 'Ausencia' : 'Licencia'}</b> ${fmtFecha(a.fecha)} ${badgeEstado(a.estado)}<br><small>${esc(a.motivo)}${a.adjunto ? ' · adjunto: ' + esc(a.adjunto) : ''}${a.resolvio ? ' · resolvió ' + esc(nombreCorto(a.resolvio)) : ''}</small></div>`).join('') || '<p class="muted">Todavía no hiciste pedidos.</p>'}</div>`;
}
conectar.ausencias = () => {
  $('#form-ausencia').onsubmit = e => {
    e.preventDefault();
    const d = datosForm(e.target);
    const estado = yo.rol === 'director' ? 'aprobado' : 'pendiente';
    DB.agregar('ausencias', { tipo: d.tipo, fecha: d.fecha, motivo: d.motivo, adjunto: d.adjunto?.name || '', usuario: yo.id, estado, creado: hoyISO() });
    toast('Pedido enviado');
    render();
  };
};

// ---------- Vacaciones ----------

function vistaVacaciones() {
  const [anio, mesNum] = hoyISO().split('-').map(Number);
  const periodo = mesNum <= 4 ? anio - 1 : anio; // próximo período o el que está en curso
  const corresponden = diasVacacionesQueCorresponden(yo, periodo);
  const usados = diasUsados(yo.id, periodo);
  const anticip = Number(DB.config.anticipacionVacaciones);
  const mias = DB.todos('vacaciones').filter(v => v.usuario === yo.id).sort((a, b) => b.desde.localeCompare(a.desde));
  const todas = DB.todos('vacaciones').filter(v => v.estado !== 'rechazado' && v.hasta >= hoyISO()).sort((a, b) => a.desde.localeCompare(b.desde));
  return `<h1>Vacaciones</h1>
  <div class="grid">
    <div class="card"><h3>Te corresponden</h3><div class="stat">${corresponden} días</div><small>Período ${periodo}/${periodo + 1}, según tu antigüedad</small></div>
    <div class="card"><h3>Pedidos o tomados</h3><div class="stat">${usados} días</div></div>
    <div class="card"><h3>Disponibles</h3><div class="stat">${Math.max(0, corresponden - usados)} días</div></div>
  </div>
  <div class="card">
    <h3>Pedir vacaciones</h3>
    <div class="notice info">Pedilas con <b>al menos ${anticip} días de anticipación</b>. Por ley, HD tiene que confirmar las fechas 45 días antes, y las vacaciones se toman entre el 1 de octubre y el 30 de abril.</div>
    <form class="stack" id="form-vac">
      <div class="grid">
        <label>Desde <input type="date" name="desde" required></label>
        <label>Hasta (inclusive) <input type="date" name="hasta" required></label>
      </div>
      <div id="vac-aviso"></div>
      <div><button class="primary">Enviar pedido</button></div>
    </form>
  </div>
  <h2>Mis pedidos</h2>
  <div class="card">${mias.map(v => `<div class="list-item">${fmtFecha(v.desde)} al ${fmtFecha(v.hasta)} · ${diasEntre(v.desde, v.hasta) + 1} días ${badgeEstado(v.estado)}${v.avisos?.length ? `<br><small>${v.avisos.map(esc).join(' · ')}</small>` : ''}</div>`).join('') || '<p class="muted">Todavía no pediste vacaciones.</p>'}</div>
  <h2>Calendario de vacaciones del equipo</h2>
  <div class="card table-wrap"><table>
    <thead><tr><th>Persona</th><th>Desde</th><th>Hasta</th><th>Estado</th></tr></thead>
    <tbody>${todas.map(v => `<tr><td>${esc(nombre(v.usuario))}</td><td>${fmtFecha(v.desde)}</td><td>${fmtFecha(v.hasta)}</td><td>${badgeEstado(v.estado)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No hay vacaciones próximas.</td></tr>'}</tbody>
  </table></div>`;
}
function revisarVacaciones(u, desde, hasta) {
  const errores = [], avisos = [];
  if (!desde || !hasta) return { errores, avisos };
  if (hasta < desde) { errores.push('La fecha "hasta" es anterior a "desde".'); return { errores, avisos }; }
  const dias = diasEntre(desde, hasta) + 1;
  const periodo = periodoDe(desde);
  const disponibles = diasVacacionesQueCorresponden(u, periodo) - diasUsados(u.id, periodo);
  if (dias > disponibles) errores.push(`Pedís ${dias} días y te quedan ${Math.max(0, disponibles)} en el período ${periodo}/${periodo + 1}.`);
  const anticip = Number(DB.config.anticipacionVacaciones);
  const faltan = diasEntre(hoyISO(), desde);
  if (faltan < anticip) avisos.push(`Se pide con ${faltan} días de anticipación (lo acordado es ${anticip}).`);
  if (!dentroDelPeriodoLegal(desde) || !dentroDelPeriodoLegal(hasta)) avisos.push('Fuera del período 1/10 al 30/4: solo de común acuerdo.');
  const choques = DB.todos('vacaciones').filter(v => v.usuario !== u.id && v.estado !== 'rechazado' &&
    usuario(v.usuario)?.sector === u.sector && v.desde <= hasta && v.hasta >= desde);
  if (choques.length) avisos.push('Se superpone con ' + choques.map(v => nombreCorto(v.usuario)).join(', ') + ', del mismo sector.');
  return { errores, avisos, dias };
}
conectar.vacaciones = () => {
  const form = $('#form-vac');
  const mostrar = () => {
    const { errores, avisos, dias } = revisarVacaciones(yo, form.desde.value, form.hasta.value);
    $('#vac-aviso').innerHTML =
      (dias && !errores.length ? `<div class="notice ok">${dias} días corridos.</div>` : '') +
      errores.map(t => `<div class="notice bad">${esc(t)}</div>`).join('') +
      avisos.map(t => `<div class="notice warn">${esc(t)} Igual podés enviarlo y se decide al aprobar.</div>`).join('');
    return errores.length === 0;
  };
  form.desde.onchange = form.hasta.onchange = mostrar;
  form.onsubmit = e => {
    e.preventDefault();
    if (!mostrar()) return;
    const { avisos } = revisarVacaciones(yo, form.desde.value, form.hasta.value);
    DB.agregar('vacaciones', { usuario: yo.id, desde: form.desde.value, hasta: form.hasta.value, estado: estadoInicialVacaciones(yo), avisos, creado: hoyISO(), historial: [] });
    toast('Pedido de vacaciones enviado');
    render();
  };
};

// ---------- Aprobaciones ----------

function vistaAprobaciones() {
  const p = pendientesPara(yo);
  const boton = (col, id, txtOk = 'Aprobar') => `<div class="row" style="margin-top:6px"><button class="ok" data-aprobar="${col}|${id}">${txtOk}</button><button class="bad" data-rechazar="${col}|${id}">Rechazar</button></div>`;
  return `<h1>Aprobaciones</h1>
  ${p.total === 0 ? '<div class="card"><p class="muted">No hay nada pendiente para vos.</p></div>' : ''}
  ${p.vac.length ? `<h2>Vacaciones</h2><div class="card">${p.vac.map(v => {
    const etapaSector = v.estado === 'pendiente_sector' && !puede(yo, 'aprobarVacacionesFinal');
    return `<div class="list-item"><b>${esc(nombre(v.usuario))}</b>: ${fmtFecha(v.desde)} al ${fmtFecha(v.hasta)} (${diasEntre(v.desde, v.hasta) + 1} días) ${badgeEstado(v.estado)}
      ${v.avisos?.length ? v.avisos.map(t => `<div class="notice warn">${esc(t)}</div>`).join('') : ''}
      ${boton('vacaciones', v.id, etapaSector ? 'Aprobar y pasar a Horacio' : 'Aprobar')}</div>`;
  }).join('')}</div>` : ''}
  ${p.aus.length ? `<h2>Ausencias y licencias</h2><div class="card">${p.aus.map(a => `<div class="list-item"><b>${esc(nombre(a.usuario))}</b>: ${a.tipo === 'ausencia' ? 'ausencia' : 'licencia'} el ${fmtFecha(a.fecha)}<br><small>${esc(a.motivo)}${a.adjunto ? ' · adjunto: ' + esc(a.adjunto) : ''}</small>${boton('ausencias', a.id)}</div>`).join('')}</div>` : ''}
  ${p.cor.length ? `<h2>Correcciones de fichaje</h2><div class="card">${p.cor.map(c => `<div class="list-item"><b>${esc(nombre(c.usuario))}</b>: ${c.tipo} el ${fmtFecha(c.fecha)} a las ${c.hora}<br><small>${esc(c.motivo)}</small>${boton('correcciones', c.id)}</div>`).join('')}</div>` : ''}`;
}
conectar.aprobaciones = () => {
  document.querySelectorAll('[data-aprobar]').forEach(b => b.onclick = () => {
    const [col, id] = b.dataset.aprobar.split('|');
    const item = DB.buscar(col, id);
    if (col === 'vacaciones') {
      const estado = puede(yo, 'aprobarVacacionesFinal') ? 'aprobado' : 'pendiente_director';
      DB.actualizar(col, id, { estado, historial: [...(item.historial || []), { quien: yo.id, accion: 'aprobó', fecha: hoyISO() }] });
    } else {
      DB.actualizar(col, id, { estado: 'aprobado', resolvio: yo.id });
      if (col === 'correcciones') DB.agregar('fichajes', { usuario: item.usuario, fecha: item.fecha, hora: item.hora, tipo: item.tipo, corregido: true, aprobo: yo.id });
    }
    toast('Aprobado');
    render();
  });
  document.querySelectorAll('[data-rechazar]').forEach(b => b.onclick = () => {
    const [col, id] = b.dataset.rechazar.split('|');
    DB.actualizar(col, id, { estado: 'rechazado', resolvio: yo.id });
    toast('Rechazado');
    render();
  });
};

// ---------- Lista de precios ----------

let editandoPrecio = null;
function vistaPrecios() {
  const costos = puede(yo, 'verCostos');
  const editar = puede(yo, 'editarPrecios');
  const lista = [...DB.todos('precios')].sort((a, b) => (a.marca + a.tipo).localeCompare(b.marca + b.tipo));
  const ed = editandoPrecio && DB.buscar('precios', editandoPrecio);
  const money = (n, mon) => n ? `${mon} ${Number(n).toLocaleString('es-AR')}` : '<span class="muted">a completar</span>';
  return `<h1>Lista de precios</h1>
  <p class="muted">Actualizada el ${fmtFecha(DB.valor('preciosActualizados'))}. ${editar ? '' : 'Solo Horacio puede modificarla.'}</p>
  <div class="card table-wrap"><table>
    <thead><tr><th>Marca</th><th>Equipo</th><th>Modelo</th><th class="num">Precio de venta</th>${costos ? '<th class="num">Costo</th><th class="num">Margen</th>' : ''}${editar ? '<th></th>' : ''}</tr></thead>
    <tbody>${lista.map(p => `<tr><td>${esc(p.marca)}</td><td>${esc(p.tipo)}</td><td>${esc(p.modelo)}</td><td class="num">${money(p.precio, p.moneda)}</td>
      ${costos ? `<td class="num">${money(p.costo, p.moneda)}</td><td class="num">${p.precio && p.costo ? Math.round((p.precio - p.costo) / p.precio * 100) + ' %' : ''}</td>` : ''}
      ${editar ? `<td><button data-editar="${p.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody>
  </table></div>
  ${editar ? `<div class="card"><h3>${ed ? 'Editar equipo' : 'Agregar equipo'}</h3>
    <form class="stack" id="form-precio">
      <div class="grid">
        <label>Marca <select name="marca">${opciones([['I-Optik', 'I-Optik'], ['Supore', 'Supore'], ['Oftalmología', 'Oftalmología'], ['Repuestos', 'Repuestos']], ed?.marca)}</select></label>
        <label>Equipo <input name="tipo" required value="${esc(ed?.tipo)}"></label>
        <label>Modelo <input name="modelo" required value="${esc(ed?.modelo)}"></label>
        <label>Moneda <select name="moneda">${opciones([['USD', 'USD'], ['ARS', 'ARS']], ed?.moneda)}</select></label>
        <label>Precio de venta <input type="number" min="0" step="0.01" name="precio" value="${ed?.precio || ''}"></label>
        <label>Costo <input type="number" min="0" step="0.01" name="costo" value="${ed?.costo || ''}"></label>
      </div>
      <div class="row"><button class="primary">Guardar</button>${ed ? '<button type="button" id="cancelar">Cancelar</button><button type="button" class="bad" id="borrar">Borrar</button>' : ''}</div>
    </form></div>` : ''}`;
}
conectar.precios = () => {
  document.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { editandoPrecio = b.dataset.editar; render(); });
  const form = $('#form-precio');
  if (!form) return;
  form.onsubmit = e => {
    e.preventDefault();
    const d = datosForm(form);
    d.precio = Number(d.precio) || 0;
    d.costo = Number(d.costo) || 0;
    if (editandoPrecio) DB.actualizar('precios', editandoPrecio, d); else DB.agregar('precios', d);
    DB.setValor('preciosActualizados', hoyISO());
    editandoPrecio = null;
    toast('Precio guardado');
    render();
  };
  if ($('#cancelar')) $('#cancelar').onclick = () => { editandoPrecio = null; render(); };
  if ($('#borrar')) $('#borrar').onclick = () => {
    if (!confirm('¿Borrar este equipo de la lista?')) return;
    DB.borrar('precios', editandoPrecio);
    editandoPrecio = null;
    render();
  };
};

// ---------- Folletos y material ----------

let filtroMaterial = '';
function vistaMaterial() {
  const subir = puede(yo, 'subirMaterial');
  const q = filtroMaterial.toLowerCase();
  const lista = DB.todos('material').filter(m => !q || (m.titulo + m.marca + m.tipo).toLowerCase().includes(q));
  return `<h1>Folletos y material</h1>
  <div class="card"><label>Buscar <input id="buscar" value="${esc(filtroMaterial)}" placeholder="Marca, equipo, tipo…"></label></div>
  <div class="card">${lista.map(m => `<div class="list-item row" style="justify-content:space-between">
      <div><b>${esc(m.titulo)}</b><br><small>${esc(m.marca)} · ${esc(m.tipo)} · subido por ${esc(nombreCorto(m.subio))} el ${fmtFecha(m.fecha)}</small></div>
      <div class="row">${m.link ? `<a class="btn btn-primary" href="${esc(m.link)}" target="_blank" rel="noopener">Abrir</a>` : '<span class="muted">link a completar</span>'}
      ${subir ? `<button class="bad" data-borrar="${m.id}">Borrar</button>` : ''}</div></div>`).join('') || '<p class="muted">No hay material que coincida.</p>'}</div>
  ${subir ? `<div class="card"><h3>Agregar material</h3>
    <p class="muted">Subí el archivo a Google Drive, compartilo con "cualquiera con el enlace" y pegá el link acá.</p>
    <form class="stack" id="form-material"><div class="grid">
      <label>Título <input name="titulo" required></label>
      <label>Marca <select name="marca">${opciones([['I-Optik', 'I-Optik'], ['Supore', 'Supore'], ['Oftalmología', 'Oftalmología'], ['Briot / Weco / Luneau', 'Briot / Weco / Luneau'], ['HD', 'HD (institucional)']])}</select></label>
      <label>Tipo <select name="tipo">${opciones([['Folleto', 'Folleto'], ['Ficha técnica', 'Ficha técnica'], ['Manual', 'Manual'], ['Video', 'Video'], ['Fotos', 'Fotos para redes']])}</select></label>
      <label>Link <input type="url" name="link" required placeholder="https://drive.google.com/…"></label>
    </div><div><button class="primary">Agregar</button></div></form></div>` : ''}`;
}
conectar.material = () => {
  const b = $('#buscar');
  b.oninput = () => { filtroMaterial = b.value; render(); const n = $('#buscar'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  document.querySelectorAll('[data-borrar]').forEach(x => x.onclick = () => { if (confirm('¿Borrar este material?')) { DB.borrar('material', x.dataset.borrar); render(); } });
  const f = $('#form-material');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    DB.agregar('material', { ...datosForm(f), subio: yo.id, fecha: hoyISO() });
    toast('Material agregado');
    render();
  };
};

// ---------- Agenda de campo ----------

let editandoVisita = null;
function vistaAgenda() {
  const editar = puede(yo, 'editarAgenda');
  const lista = [...DB.todos('agenda')].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const proximas = lista.filter(v => v.fecha >= hoyISO());
  const pasadas = lista.filter(v => v.fecha < hoyISO()).reverse().slice(0, 15);
  const ed = editandoVisita && DB.buscar('agenda', editandoVisita);
  const tecnicos = usuariosActivos().filter(u => u.sector === 'ventas').map(u => [u.id, u.nombre]);
  const item = v => `<div class="list-item"><b>${fmtFecha(v.fecha)} ${esc(v.hora)}</b> · ${esc(v.tipo)} · ${esc(v.cliente)} ${badgeEstado(v.estado)}<br>
    <small>${esc(v.direccion)} · ${esc(v.contacto)} · a cargo de ${esc(nombreCorto(v.tecnico))}</small>${v.notas ? `<br><small>Notas: ${esc(v.notas)}</small>` : ''}
    ${editar ? `<div><button data-editar="${v.id}">Editar</button></div>` : ''}</div>`;
  return `<h1>Agenda de servicio en campo</h1>
  <h2>Próximas</h2><div class="card">${proximas.map(item).join('') || '<p class="muted">No hay visitas programadas.</p>'}</div>
  ${pasadas.length ? `<h2>Anteriores</h2><div class="card">${pasadas.map(item).join('')}</div>` : ''}
  ${editar ? `<div class="card"><h3>${ed ? 'Editar visita' : 'Nueva visita'}</h3>
    <form class="stack" id="form-visita"><div class="grid">
      <label>Fecha <input type="date" name="fecha" required value="${esc(ed?.fecha)}"></label>
      <label>Hora <input type="time" name="hora" value="${esc(ed?.hora)}"></label>
      <label>Tipo <select name="tipo">${opciones([['Instalación', 'Instalación y puesta en marcha'], ['Servicio técnico', 'Servicio técnico'], ['Capacitación', 'Capacitación'], ['Mantenimiento', 'Mantenimiento']], ed?.tipo)}</select></label>
      <label>A cargo de <select name="tecnico">${opciones(tecnicos, ed?.tecnico || yo.id)}</select></label>
      <label>Cliente <input name="cliente" required value="${esc(ed?.cliente)}"></label>
      <label>Dirección <input name="direccion" value="${esc(ed?.direccion)}"></label>
      <label>Contacto <input name="contacto" value="${esc(ed?.contacto)}"></label>
      <label>Estado <select name="estado">${opciones([['programada', 'Programada'], ['realizada', 'Realizada'], ['cancelada', 'Cancelada']], ed?.estado)}</select></label>
    </div>
    <label>Notas (qué se hizo, pendientes) <textarea name="notas">${esc(ed?.notas)}</textarea></label>
    <div class="row"><button class="primary">Guardar</button>${ed ? '<button type="button" id="cancelar">Cancelar</button><button type="button" class="bad" id="borrar">Borrar</button>' : ''}</div></form></div>` : ''}`;
}
conectar.agenda = () => {
  document.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { editandoVisita = b.dataset.editar; render(); $('#form-visita').scrollIntoView(); });
  const f = $('#form-visita');
  if (!f) return;
  f.onsubmit = e => {
    e.preventDefault();
    const d = datosForm(f);
    if (editandoVisita) DB.actualizar('agenda', editandoVisita, d); else DB.agregar('agenda', d);
    editandoVisita = null;
    toast('Visita guardada');
    render();
  };
  if ($('#cancelar')) $('#cancelar').onclick = () => { editandoVisita = null; render(); };
  if ($('#borrar')) $('#borrar').onclick = () => { if (confirm('¿Borrar esta visita?')) { DB.borrar('agenda', editandoVisita); editandoVisita = null; render(); } };
};

// ---------- Tareas ----------

let verHechas = false;
function vistaTareas() {
  const visibles = DB.todos('tareas').filter(t => usuario(t.asignado) && puede(yo, 'verTareasDe', usuario(t.asignado)) && (verHechas || !t.hecha))
    .sort((a, b) => (a.vence || '9').localeCompare(b.vence || '9'));
  const asignables = usuariosActivos().filter(u => puede(yo, 'asignarTareaA', u));
  const porPersona = {};
  for (const t of visibles) (porPersona[t.asignado] ||= []).push(t);
  return `<h1>Tareas</h1>
  <div class="card row"><label class="row" style="color:inherit"><input type="checkbox" id="ver-hechas" style="width:auto" ${verHechas ? 'checked' : ''}> Mostrar también las terminadas</label></div>
  ${Object.entries(porPersona).map(([uid, ts]) => `<h2>${esc(nombre(uid))}</h2><div class="card">${ts.map(t => {
    const puedeMarcar = t.asignado === yo.id || t.creo === yo.id || yo.rol === 'director';
    const vencida = !t.hecha && t.vence && t.vence < hoyISO();
    return `<div class="list-item row" style="justify-content:space-between">
      <label class="row" style="color:inherit;flex:1"><input type="checkbox" style="width:auto" data-tarea="${t.id}" ${t.hecha ? 'checked' : ''} ${puedeMarcar ? '' : 'disabled'}>
      <span>${t.hecha ? `<s>${esc(t.titulo)}</s>` : esc(t.titulo)}<br><small>${t.vence ? 'vence ' + fmtFecha(t.vence) : 'sin fecha'} · la cargó ${esc(nombreCorto(t.creo))}</small> ${vencida ? '<span class="badge bad">vencida</span>' : ''}</span></label>
      ${t.creo === yo.id || yo.rol === 'director' ? `<button class="bad" data-borrar="${t.id}">Borrar</button>` : ''}</div>`;
  }).join('')}</div>`).join('') || '<div class="card"><p class="muted">No hay tareas.</p></div>'}
  ${asignables.length ? `<div class="card"><h3>Nueva tarea</h3><form class="stack" id="form-tarea"><div class="grid">
    <label>Tarea <input name="titulo" required></label>
    <label>Para <select name="asignado">${opciones(asignables.map(u => [u.id, u.nombre]), yo.id)}</select></label>
    <label>Vence <input type="date" name="vence"></label>
  </div><div><button class="primary">Agregar</button></div></form></div>` : ''}`;
}
conectar.tareas = () => {
  $('#ver-hechas').onchange = e => { verHechas = e.target.checked; render(); };
  document.querySelectorAll('[data-tarea]').forEach(c => c.onchange = () => { DB.actualizar('tareas', c.dataset.tarea, { hecha: c.checked }); render(); });
  document.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => { if (confirm('¿Borrar esta tarea?')) { DB.borrar('tareas', b.dataset.borrar); render(); } });
  const f = $('#form-tarea');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    DB.agregar('tareas', { ...datosForm(f), creo: yo.id, hecha: false });
    toast('Tarea agregada');
    render();
  };
};

// ---------- Cartelera ----------

function vistaCartelera() {
  const lista = [...DB.todos('novedades')].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return `<h1>Cartelera de novedades</h1>
  ${puede(yo, 'publicarNovedad') ? `<div class="card"><form class="stack" id="form-novedad">
    <label>Título <input name="titulo" required placeholder="Ej.: Llegó mercadería de I-Optik"></label>
    <label>Texto <textarea name="texto" required></textarea></label>
    <div><button class="primary">Publicar</button></div></form></div>` : ''}
  <div class="card">${lista.map(n => `<div class="list-item"><h3>${esc(n.titulo)}</h3><p>${esc(n.texto)}</p>
    <small>${esc(nombre(n.autor))} · ${fmtFecha(n.fecha)}</small>
    ${n.autor === yo.id || yo.rol === 'director' ? ` <button class="bad" data-borrar="${n.id}">Borrar</button>` : ''}</div>`).join('') || '<p class="muted">Sin novedades.</p>'}</div>`;
}
conectar.cartelera = () => {
  document.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => { if (confirm('¿Borrar esta novedad?')) { DB.borrar('novedades', b.dataset.borrar); render(); } });
  const f = $('#form-novedad');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    DB.agregar('novedades', { ...datosForm(f), autor: yo.id, fecha: hoyISO() });
    toast('Publicado');
    render();
  };
};

// ---------- Recordatorios ----------

const CATEGORIAS_REC = { pagos: 'Pagos y cuotas', anmat: 'ANMAT', garantias: 'Garantías de equipos vendidos' };
function badgeVence(iso) {
  const d = diasEntre(hoyISO(), iso);
  if (d < 0) return `<span class="badge bad">vencido el ${fmtFecha(iso)}</span>`;
  if (d <= 7) return `<span class="badge warn">vence ${d === 0 ? 'hoy' : 'en ' + d + ' días'}</span>`;
  return `<span class="badge">vence ${fmtFecha(iso)}</span>`;
}
function vistaRecordatorios() {
  const visibles = DB.todos('recordatorios').filter(r => puede(yo, 'verRecordatorio', r)).sort((a, b) => a.vence.localeCompare(b.vence));
  const cats = Object.keys(CATEGORIAS_REC).filter(c => puede(yo, 'editarRecordatorio', { categoria: c }));
  return `<h1>Recordatorios y vencimientos</h1>
  ${Object.entries(CATEGORIAS_REC).map(([c, t]) => {
    const rs = visibles.filter(r => r.categoria === c);
    if (!rs.length) return '';
    return `<h2>${t}</h2><div class="card">${rs.map(r => `<div class="list-item row" style="justify-content:space-between">
      <div>${esc(r.titulo)} ${badgeVence(r.vence)}${r.notas ? `<br><small>${esc(r.notas)}</small>` : ''}</div>
      ${puede(yo, 'editarRecordatorio', r) ? `<button data-listo="${r.id}">Listo, borrar</button>` : ''}</div>`).join('')}</div>`;
  }).join('') || '<div class="card"><p class="muted">No hay recordatorios.</p></div>'}
  ${cats.length ? `<div class="card"><h3>Nuevo recordatorio</h3><form class="stack" id="form-rec"><div class="grid">
    <label>Qué <input name="titulo" required></label>
    <label>Categoría <select name="categoria">${opciones(cats.map(c => [c, CATEGORIAS_REC[c]]))}</select></label>
    <label>Vence <input type="date" name="vence" required></label>
  </div><label>Notas <input name="notas"></label><div><button class="primary">Agregar</button></div></form></div>` : ''}`;
}
conectar.recordatorios = () => {
  document.querySelectorAll('[data-listo]').forEach(b => b.onclick = () => { DB.borrar('recordatorios', b.dataset.listo); render(); });
  const f = $('#form-rec');
  if (f) f.onsubmit = e => {
    e.preventDefault();
    DB.agregar('recordatorios', datosForm(f));
    toast('Recordatorio agregado');
    render();
  };
};

// ---------- Recibos de sueldo ----------

// El contador manda un solo PDF por mes con una página por empleado.
// La app lee el nombre escrito en cada página y la guarda como recibo de esa persona.

const normalizar = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
function nombreArchivoRecibo(uid, mes) {
  const partes = nombre(uid).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/);
  const apellido = partes.length >= 4 ? partes.slice(-2).join('') : partes[partes.length - 1];
  const mesNombre = MESES[Number(mes.slice(5)) - 1];
  return `${mes}-${mesNombre[0].toUpperCase() + mesNombre.slice(1)}-${partes[0]}${apellido}.pdf`;
}
// Una página es de una persona si en su texto aparecen todas las palabras de su nombre
function detectarEmpleado(textoPagina) {
  const texto = normalizar(textoPagina);
  const candidatos = usuariosActivos().filter(u => u.rol !== 'director' &&
    normalizar(u.nombre).split(/\s+/).every(palabra => texto.includes(palabra)));
  return candidatos.length === 1 ? candidatos[0].id : '';
}
function descargar(nombreArchivo, url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
}
function urlDeDataURL(dataURL) {
  const [cab, b64] = dataURL.split(',');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: cab.slice(5).split(';')[0] }));
}
const aDataURL = bytes => new Promise(ok => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.readAsDataURL(new Blob([bytes], { type: 'application/pdf' }));
});

let reciboEnProceso = null; // { mes, bytes, paginas: [{ numero, usuario }] }

function vistaRecibos() {
  const visibles = DB.todos('recibos').filter(r => usuario(r.usuario) && puede(yo, 'verRecibosDe', usuario(r.usuario))).sort((a, b) => b.mes.localeCompare(a.mes));
  const mesAnterior = sumarDias(hoyISO().slice(0, 8) + '01', -1).slice(0, 7);
  const p = reciboEnProceso;
  return `<h1>Recibos de sueldo</h1>
  <div class="card table-wrap"><table>
    <thead><tr><th>Mes</th><th>Persona</th><th></th></tr></thead>
    <tbody>${visibles.map(r => `<tr><td>${MESES[Number(r.mes.slice(5)) - 1]} ${r.mes.slice(0, 4)}</td><td>${esc(nombre(r.usuario))}</td>
      <td><button data-abrir="${r.id}">Descargar</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Todavía no hay recibos cargados.</td></tr>'}</tbody>
  </table></div>
  ${puede(yo, 'subirRecibos') ? `<div class="card"><h3>Cargar el PDF del contador</h3>
    <p class="muted">Subí el PDF tal como lo manda Alcalá, con todos los recibos juntos. La app separa las páginas, reconoce a quién es cada una por el nombre y se lo muestra solo a esa persona.</p>
    <form class="stack" id="form-recibos"><div class="grid">
      <label>Mes de los recibos <input type="month" name="mes" required value="${p?.mes || mesAnterior}"></label>
      <label>PDF de Alcalá <input type="file" name="pdf" accept="application/pdf" required></label>
    </div><div><button class="primary">Separar recibos</button></div></form>
    <div id="msg-recibos"></div>
    ${p ? `<h3 style="margin-top:16px">Revisá antes de guardar</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Página</th><th>Es de</th><th>Se guarda como</th></tr></thead>
        <tbody>${p.paginas.map((pg, i) => `<tr><td>${pg.numero}</td>
          <td><select data-pagina="${i}"><option value="">— no cargar —</option>${opciones(usuariosActivos().filter(u => u.rol !== 'director').map(u => [u.id, u.nombre]), pg.usuario)}</select>
          ${pg.usuario ? '' : '<div class="notice warn">No se reconoció el nombre. Elegí a quién corresponde.</div>'}</td>
          <td><small>${pg.usuario ? esc(nombreArchivoRecibo(pg.usuario, p.mes)) : ''}</small></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="row" style="margin-top:12px"><button class="primary" id="guardar-recibos">Guardar recibos</button>
      <button id="descargar-recibos">Descargarlos también (para Drive)</button><button id="cancelar-recibos">Cancelar</button></div>` : ''}
  </div>` : ''}`;
}

async function separarPaginas(bytes, numeros) {
  const original = await PDFLib.PDFDocument.load(bytes);
  const salida = [];
  for (const n of numeros) {
    const doc = await PDFLib.PDFDocument.create();
    const [pagina] = await doc.copyPages(original, [n - 1]);
    doc.addPage(pagina);
    salida.push(await doc.save());
  }
  return salida;
}

conectar.recibos = () => {
  document.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => {
    const r = DB.buscar('recibos', b.dataset.abrir);
    if (r.archivo) descargar(r.nombreArchivo || 'recibo.pdf', urlDeDataURL(r.archivo));
    else if (r.link) window.open(r.link, '_blank', 'noopener');
  });
  const f = $('#form-recibos');
  if (!f) return;
  const msg = $('#msg-recibos');
  f.onsubmit = async e => {
    e.preventDefault();
    if (!window.pdfjsLib || !window.PDFLib) { msg.innerHTML = '<div class="notice bad">No se pudo cargar el lector de PDF. Revisá la conexión.</div>'; return; }
    msg.innerHTML = '<div class="notice info">Leyendo el PDF…</div>';
    try {
      const bytes = new Uint8Array(await f.pdf.files[0].arrayBuffer());
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const paginas = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const contenido = await (await doc.getPage(n)).getTextContent();
        paginas.push({ numero: n, usuario: detectarEmpleado(contenido.items.map(i => i.str).join(' ')) });
      }
      reciboEnProceso = { mes: f.mes.value, bytes, paginas };
      render();
    } catch (err) {
      msg.innerHTML = '<div class="notice bad">No se pudo leer ese archivo. ¿Es el PDF de los recibos?</div>';
    }
  };
  document.querySelectorAll('[data-pagina]').forEach(s => s.onchange = () => {
    reciboEnProceso.paginas[Number(s.dataset.pagina)].usuario = s.value;
    render();
  });
  const elegidas = () => reciboEnProceso.paginas.filter(pg => pg.usuario);
  if ($('#cancelar-recibos')) $('#cancelar-recibos').onclick = () => { reciboEnProceso = null; render(); };
  if ($('#descargar-recibos')) $('#descargar-recibos').onclick = async () => {
    const pags = elegidas();
    const archivos = await separarPaginas(reciboEnProceso.bytes, pags.map(pg => pg.numero));
    archivos.forEach((bytes, i) => descargar(nombreArchivoRecibo(pags[i].usuario, reciboEnProceso.mes),
      URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))));
  };
  if ($('#guardar-recibos')) $('#guardar-recibos').onclick = async () => {
    const pags = elegidas();
    if (!pags.length) { toast('No hay páginas asignadas a nadie'); return; }
    const { mes } = reciboEnProceso;
    const archivos = await separarPaginas(reciboEnProceso.bytes, pags.map(pg => pg.numero));
    for (let i = 0; i < pags.length; i++) {
      const previo = DB.todos('recibos').find(r => r.usuario === pags[i].usuario && r.mes === mes);
      if (previo) DB.borrar('recibos', previo.id);
      DB.agregar('recibos', { usuario: pags[i].usuario, mes, nombreArchivo: nombreArchivoRecibo(pags[i].usuario, mes), archivo: await aDataURL(archivos[i]), subio: yo.id });
    }
    reciboEnProceso = null;
    toast(DB.guardar() ? `${pags.length} recibos guardados` : 'Atención: el navegador no tiene lugar para guardarlos');
    render();
  };
};

// ---------- Usuarios y ajustes ----------

let editandoUsuario = null;
function vistaUsuarios() {
  const ed = editandoUsuario && usuario(editandoUsuario);
  const cfg = DB.config;
  return `<h1>Usuarios y ajustes</h1>
  <div class="card table-wrap"><table>
    <thead><tr><th>Nombre</th><th>Cargo</th><th>Rol</th><th>Ingreso</th><th>Estado</th><th></th></tr></thead>
    <tbody>${DB.todos('usuarios').map(u => `<tr><td>${esc(u.nombre)}</td><td>${esc(u.cargo)}</td><td>${ROLES[u.rol]}</td><td>${fmtFecha(u.ingreso)}</td>
      <td>${u.activo ? '<span class="badge ok">activo</span>' : '<span class="badge">de baja</span>'}</td><td><button data-editar="${u.id}">Editar</button></td></tr>`).join('')}</tbody>
  </table><small>Las fechas de ingreso son de ejemplo: cargá las reales, porque de ahí salen los días de vacaciones.</small></div>
  <div class="card"><h3>${ed ? 'Editar ' + esc(ed.nombre) : 'Nuevo usuario'}</h3>
    <form class="stack" id="form-usuario"><div class="grid">
      <label>Nombre completo <input name="nombre" required value="${esc(ed?.nombre)}"></label>
      <label>Cargo <input name="cargo" value="${esc(ed?.cargo)}"></label>
      <label>Rol <select name="rol">${opciones(Object.entries(ROLES), ed?.rol || 'empleado')}</select></label>
      <label>Sector <select name="sector">${opciones(Object.entries(SECTORES), ed?.sector || 'ventas')}</select></label>
      <label>Fecha de ingreso <input type="date" name="ingreso" required value="${esc(ed?.ingreso)}"></label>
      <label>Estado <select name="activo">${opciones([['si', 'Activo'], ['no', 'De baja']], ed && !ed.activo ? 'no' : 'si')}</select></label>
    </div><div class="row"><button class="primary">Guardar</button>${ed ? '<button type="button" id="cancelar">Cancelar</button>' : ''}</div></form></div>
  <div class="card"><h3>Ajustes</h3>
    <form class="stack" id="form-ajustes"><div class="grid">
      <label>Hora de entrada <input type="time" name="horaEntrada" value="${esc(cfg.horaEntrada)}"></label>
      <label>Tolerancia (minutos) <input type="number" min="0" name="toleranciaMin" value="${esc(cfg.toleranciaMin)}"></label>
      <label>Anticipación para pedir vacaciones (días) <input type="number" min="45" name="anticipacionVacaciones" value="${esc(cfg.anticipacionVacaciones)}"></label>
    </div><div><button class="primary">Guardar ajustes</button></div></form></div>
  <div class="card"><h3>Datos de prueba</h3><p class="muted">Borra todo lo cargado en este navegador y vuelve a los datos de ejemplo.</p><button class="bad" id="reiniciar">Reiniciar datos de prueba</button></div>`;
}
conectar.usuarios = () => {
  document.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => { editandoUsuario = b.dataset.editar; render(); });
  if ($('#cancelar')) $('#cancelar').onclick = () => { editandoUsuario = null; render(); };
  $('#form-usuario').onsubmit = e => {
    e.preventDefault();
    const d = datosForm(e.target);
    d.activo = d.activo === 'si';
    if (editandoUsuario) {
      if (editandoUsuario === yo.id && d.rol !== 'director') { toast('No podés sacarte el rol de Director a vos mismo'); return; }
      DB.actualizar('usuarios', editandoUsuario, d);
    } else {
      const id = d.nombre.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 16) || nuevoId();
      DB.todos('usuarios').push({ id: usuario(id) ? id + nuevoId().slice(0, 3) : id, ...d });
      DB.guardar();
    }
    editandoUsuario = null;
    yo = usuario(yo.id);
    toast('Usuario guardado');
    render();
  };
  $('#form-ajustes').onsubmit = e => {
    e.preventDefault();
    DB.setConfig(datosForm(e.target));
    toast('Ajustes guardados');
    render();
  };
  $('#reiniciar').onclick = () => {
    if (!confirm('¿Borrar todo y volver a los datos de ejemplo?')) return;
    DB.reiniciar();
    yo = usuario(yo.id);
    render();
  };
};

// ---------- Arranque ----------

DB.cargar();
try { yo = usuario(sessionStorage.getItem('hdapp-usuario')) || null; } catch (e) { yo = null; }
$('#menu-btn').onclick = () => $('#sidenav').classList.toggle('open');
document.addEventListener('click', e => {
  const nav = $('#sidenav');
  if (nav.classList.contains('open') && !nav.contains(e.target) && e.target.id !== 'menu-btn') nav.classList.remove('open');
});
window.addEventListener('hashchange', render);
render();
