// Roles y permisos. Refleja la tabla de "roles-y-permisos.md".
// Cada permiso es una función (usuario, contexto) => true/false, así las reglas
// de "solo lo propio" y "solo su sector" quedan en un único lugar.

const ROLES = {
  director: 'Director',
  sub_admin: 'Subdirección Administración',
  sub_ventas: 'Subdirección Ventas y Servicio',
  empleado: 'Empleado',
};

const SECTORES = {
  direccion: 'Dirección',
  administracion: 'Administración',
  ventas: 'Ventas, Servicio Técnico y Marketing',
};

const esDirector = u => u.rol === 'director';
const esSub = u => u.rol === 'sub_admin' || u.rol === 'sub_ventas';
const mismoSector = (u, otro) => otro && u.sector === otro.sector;

const PERMISOS = {
  // Asistencia
  // Por ahora (mapa del 09/11/2026): cada uno ve solo la suya y Horacio ve la de todos.
  verAsistenciaDe: (u, otro) => esDirector(u) || u.id === otro.id,
  exportarAsistencia: u => esDirector(u),
  aprobarCorreccion: u => esDirector(u),

  // Ausencias y licencias
  // Por ahora aprueba solo Horacio (más adelante se suma Lucas para su sector).
  aprobarAusenciaDe: u => esDirector(u),

  // Vacaciones: por ahora una sola etapa, la de Horacio.
  // Más adelante: (u, otro) => u.rol === 'sub_ventas' && u.id !== otro.id && mismoSector(u, otro)
  aprobarVacacionesSectorDe: () => false,
  aprobarVacacionesFinal: u => esDirector(u),

  // Precios
  verPrecios: u => u.id !== 'gustavo',
  editarPrecios: u => esDirector(u),

  // Material
  subirMaterial: u => esDirector(u),

  // Agenda de campo (oculta por ahora)
  editarAgenda: u => u.sector === 'ventas',

  // Tareas
  // Horacio asigna a cualquiera; Katia y Lucas se crean tareas para ellos mismos.
  asignarTareaA: (u, otro) => esDirector(u) || (esSub(u) && u.id === otro.id),
  verTareasDe: (u, otro) => esDirector(u) || u.id === otro.id,

  // Cartelera
  publicarNovedad: u => esDirector(u) || esSub(u),

  // Recordatorios (ocultos por ahora)
  verRecordatorio: (u, r) => r.categoria === 'garantias' || esDirector(u) || u.rol === 'sub_admin',
  editarRecordatorio: (u, r) =>
    r.categoria === 'garantias' ? u.rol === 'sub_ventas' : (esDirector(u) || u.rol === 'sub_admin'),

  // Recibos de sueldo
  verRecibosDe: (u, otro) => esDirector(u) || u.id === otro.id,
  subirRecibos: u => esDirector(u),

  // Usuarios y configuración
  administrarUsuarios: u => esDirector(u),
};

function puede(usuario, permiso, contexto) {
  const regla = PERMISOS[permiso];
  if (!regla) throw new Error('Permiso desconocido: ' + permiso);
  return !!(usuario && regla(usuario, contexto || usuario));
}
