// Almacenamiento de datos.
// En esta versión de prueba todo se guarda en el navegador (localStorage).
// Cuando se conecte Firebase, solo hay que reemplazar este archivo: el resto
// de la app usa nada más que las funciones de `DB`.

const CLAVE = 'hdapp-v1';

const hoyISO = () => fechaISO(new Date());
function fechaISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function sumarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return fechaISO(d);
}
const nuevoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function datosIniciales() {
  const hoy = hoyISO();
  const usuarios = [
    { id: 'horacio', nombre: 'Horacio G. Drewes', cargo: 'Director General', rol: 'director', sector: 'direccion', ingreso: '1980-01-02', activo: true },
    { id: 'katia', nombre: 'Katia Drewes', cargo: 'Subdirectora de Administración', rol: 'sub_admin', sector: 'administracion', ingreso: '2015-03-01', activo: true },
    { id: 'lucas', nombre: 'Lucas Guillermo Drewes', cargo: 'Subdirector de Ventas, Servicio Técnico y Marketing', rol: 'sub_ventas', sector: 'ventas', ingreso: '2012-03-01', activo: true },
    { id: 'gustavo', nombre: 'Gustavo Daniel Fiori', cargo: 'Técnico de Servicio', rol: 'empleado', sector: 'ventas', ingreso: '2008-05-01', activo: true },
    { id: 'juanmanuel', nombre: 'Juan Manuel Sánchez Valle', cargo: 'Coordinador de Ventas, Compras, Marketing y Servicios Técnicos Digitales', rol: 'empleado', sector: 'ventas', ingreso: '2021-08-01', activo: true },
  ];

  // Fichajes de ejemplo de los últimos 30 días hábiles
  const fichajes = [];
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  for (let i = 30; i >= 1; i--) {
    const dia = sumarDias(hoy, -i);
    const dow = new Date(dia + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) continue;
    for (const u of usuarios) {
      if (u.id === 'horacio') continue;
      if (azar() < 0.05) continue; // algún día sin fichar
      const llegada = 8 * 60 + 50 + Math.floor(azar() * 35);
      const salida = 17 * 60 + 55 + Math.floor(azar() * 20);
      const hora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      fichajes.push({ id: nuevoId(), usuario: u.id, fecha: dia, hora: hora(llegada), tipo: 'entrada' });
      fichajes.push({ id: nuevoId(), usuario: u.id, fecha: dia, hora: '13:00', tipo: 'salida' });
      fichajes.push({ id: nuevoId(), usuario: u.id, fecha: dia, hora: '14:00', tipo: 'entrada' });
      fichajes.push({ id: nuevoId(), usuario: u.id, fecha: dia, hora: hora(salida), tipo: 'salida' });
    }
  }

  return {
    config: {
      tokenQR: 'HD-' + nuevoId(),
      horaEntrada: '09:00',
      toleranciaMin: 10,
      horasDiarias: 8,
      anticipacionVacaciones: 60,
    },
    usuarios,
    fichajes,
    correcciones: [],
    ausencias: [
      { id: nuevoId(), usuario: 'gustavo', tipo: 'licencia', fecha: sumarDias(hoy, 3), motivo: 'Trámite personal', adjunto: '', estado: 'pendiente', creado: hoy },
      { id: nuevoId(), usuario: 'juanmanuel', tipo: 'ausencia', fecha: sumarDias(hoy, -6), motivo: 'Enfermedad', adjunto: 'certificado.jpg', estado: 'aprobado', resolvio: 'lucas', creado: sumarDias(hoy, -6) },
    ],
    vacaciones: [
      { id: nuevoId(), usuario: 'gustavo', desde: sumarDias(hoy, 70), hasta: sumarDias(hoy, 83), estado: 'pendiente_sector', creado: hoy, historial: [] },
      { id: nuevoId(), usuario: 'katia', desde: sumarDias(hoy, 90), hasta: sumarDias(hoy, 103), estado: 'aprobado', creado: sumarDias(hoy, -20), historial: [] },
    ],
    precios: [
      { id: nuevoId(), marca: 'I-Optik', tipo: 'Biseladora', modelo: 'Biseladora automática (modelo a completar)', precio: 0, costo: 0, moneda: 'USD' },
      { id: nuevoId(), marca: 'I-Optik', tipo: 'Lensómetro', modelo: 'Lensómetro automático (modelo a completar)', precio: 0, costo: 0, moneda: 'USD' },
      { id: nuevoId(), marca: 'I-Optik', tipo: 'Autorrefractómetro', modelo: 'Autorrefractómetro (modelo a completar)', precio: 0, costo: 0, moneda: 'USD' },
      { id: nuevoId(), marca: 'Supore', tipo: 'Biseladora', modelo: 'Biseladora (modelo a completar)', precio: 0, costo: 0, moneda: 'USD' },
      { id: nuevoId(), marca: 'Oftalmología', tipo: 'Lámpara de hendidura', modelo: 'Lámpara de hendidura (modelo a completar)', precio: 0, costo: 0, moneda: 'USD' },
    ],
    preciosActualizados: hoy,
    material: [
      { id: nuevoId(), titulo: 'Catálogo general I-Optik', marca: 'I-Optik', tipo: 'Folleto', link: '', subio: 'juanmanuel', fecha: hoy },
      { id: nuevoId(), titulo: 'Manual biseladora Supore', marca: 'Supore', tipo: 'Manual', link: '', subio: 'lucas', fecha: hoy },
    ],
    agenda: [
      { id: nuevoId(), fecha: sumarDias(hoy, 2), hora: '10:00', tipo: 'Instalación', cliente: 'Óptica de ejemplo', direccion: 'Av. Cabildo 1234, CABA', contacto: '11 5555-0000', tecnico: 'gustavo', estado: 'programada', notas: '' },
    ],
    tareas: [
      { id: nuevoId(), titulo: 'Actualizar contenido de Instagram y Facebook', asignado: 'juanmanuel', creo: 'lucas', vence: sumarDias(hoy, 5), hecha: false },
      { id: nuevoId(), titulo: 'Enviar lista de ventas IVA al contador', asignado: 'katia', creo: 'horacio', vence: sumarDias(hoy, 7), hecha: false },
      { id: nuevoId(), titulo: 'Calibración de lensómetro en taller', asignado: 'gustavo', creo: 'lucas', vence: sumarDias(hoy, 1), hecha: false },
    ],
    novedades: [
      { id: nuevoId(), titulo: 'Bienvenidos a la app interna', texto: 'Esta es la versión de prueba. Prueben todo y anoten lo que quieran cambiar.', autor: 'horacio', fecha: hoy },
    ],
    recordatorios: [
      { id: nuevoId(), categoria: 'pagos', titulo: 'Pago a proveedor del exterior', vence: sumarDias(hoy, 10), notas: '' },
      { id: nuevoId(), categoria: 'anmat', titulo: 'Actualizar archivos del Director Técnico', vence: sumarDias(hoy, 20), notas: '' },
      { id: nuevoId(), categoria: 'garantias', titulo: 'Vence garantía de equipo instalado (cliente de ejemplo)', vence: sumarDias(hoy, 30), notas: '' },
    ],
    recibos: [],
  };
}

const DB = {
  _datos: null,
  cargar() {
    try {
      const guardado = localStorage.getItem(CLAVE);
      this._datos = guardado ? JSON.parse(guardado) : datosIniciales();
    } catch (e) {
      this._datos = datosIniciales();
    }
    this.guardar();
  },
  guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(this._datos)); } catch (e) { /* sin almacenamiento: los datos duran hasta recargar */ }
  },
  reiniciar() {
    this._datos = datosIniciales();
    this.guardar();
  },
  get config() { return this._datos.config; },
  setConfig(cambios) { Object.assign(this._datos.config, cambios); this.guardar(); },
  todos(coleccion) { return this._datos[coleccion]; },
  buscar(coleccion, id) { return this._datos[coleccion].find(x => x.id === id); },
  agregar(coleccion, item) {
    const nuevo = { id: nuevoId(), ...item };
    this._datos[coleccion].push(nuevo);
    this.guardar();
    return nuevo;
  },
  actualizar(coleccion, id, cambios) {
    const item = this.buscar(coleccion, id);
    if (item) Object.assign(item, cambios);
    this.guardar();
    return item;
  },
  borrar(coleccion, id) {
    this._datos[coleccion] = this._datos[coleccion].filter(x => x.id !== id);
    this.guardar();
  },
  valor(clave) { return this._datos[clave]; },
  setValor(clave, v) { this._datos[clave] = v; this.guardar(); },
};
