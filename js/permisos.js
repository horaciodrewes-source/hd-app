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
  verAsistenciaDe: (u, otro) =>
    esDirector(u) || u.rol === 'sub_admin' || u.id === otro.id ||
    (u.rol === 'sub_ventas' && mismoSector(u, otro)),
  exportarAsistencia: u => esDirector(u) || u.rol === 'sub_admin',
  aprobarCorreccion: u => esDirector(u) || u.rol === 'sub_admin',

  // Ausencias y licencias
  aprobarAusenciaDe: (u, otro) =>
    esDirector(u) || (esSub(u) && u.id !== otro.id && mismoSector(u, otro)),

  // Vacaciones: Lucas aprueba la etapa de sector, Horacio da la decisión final
  aprobarVacacionesSectorDe: (u, otro) => u.rol === 'sub_ventas' && u.id !== otro.id && mismoSector(u, otro),
  aprobarVacacionesFinal: u => esDirector(u),

  // Precios
  editarPrecios: u => esDirector(u),
  verCostos: u => esDirector(u) || u.rol === 'sub_admin',

  // Material
  subirMaterial: u => esDirector(u) || u.rol === 'sub_ventas' || u.id === 'juanmanuel',

  // Agenda de campo
  editarAgenda: u => u.sector === 'ventas',

  // Tareas
  asignarTareaA: (u, otro) => esDirector(u) || (esSub(u) && mismoSector(u, otro)),
  verTareasDe: (u, otro) => esDirector(u) || u.id === otro.id || (esSub(u) && mismoSector(u, otro)),

  // Cartelera
  publicarNovedad: u => esDirector(u) || esSub(u),

  // Recordatorios
  verRecordatorio: (u, r) => r.categoria === 'garantias' || esDirector(u) || u.rol === 'sub_admin',
  editarRecordatorio: (u, r) =>
    r.categoria === 'garantias' ? u.rol === 'sub_ventas' : (esDirector(u) || u.rol === 'sub_admin'),

  // Recibos de sueldo
  verRecibosDe: (u, otro) => esDirector(u) || u.rol === 'sub_admin' || u.id === otro.id,
  subirRecibos: u => u.rol === 'sub_admin',

  // Usuarios y configuración
  administrarUsuarios: u => esDirector(u),
};

function puede(usuario, permiso, contexto) {
  const regla = PERMISOS[permiso];
  if (!regla) throw new Error('Permiso desconocido: ' + permiso);
  return !!(usuario && regla(usuario, contexto || usuario));
}
