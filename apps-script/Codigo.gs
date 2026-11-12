/**
 * HD Interna · Catálogo de folletos, manuales y videos.
 *
 * Este programa corre con la cuenta de Google de Horacio y le pasa a la app
 * la lista de archivos de la carpeta de Drive y, cuando alguien toca
 * "Abrir" o "Compartir", el archivo pedido. La carpeta puede quedar privada.
 *
 * Instalación: ver apps-script/LEEME.md
 */

// Carpeta "Folletos Manuales Precios Videos Imagenes" de Drive.
const CARPETA = '1xZtbvn4vcpgsluGBO3qIyAEEXK8slXbW';
// Prefijos que no se muestran en la app (02 = listas de precios).
const PREFIJOS_OCULTOS = ['02'];
// Tamaño máximo para pasar un archivo a la app (Apps Script responde hasta ~50 MB).
const MAX_BYTES = 30 * 1024 * 1024;

function doGet(e) {
  const p = (e && e.parameter) || {};
  let resultado;
  try {
    resultado = p.accion === 'archivo' ? archivo(p.id) : lista();
  } catch (err) {
    resultado = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}

function prefijo(nombre) {
  const m = String(nombre).trim().match(/^(\d+)/);
  return m ? m[1] : '';
}
function oculto(nombre) {
  const p = prefijo(nombre);
  return PREFIJOS_OCULTOS.some(x => p === x || p.replace(/^0+/, '') === x.replace(/^0+/, ''));
}

function lista() {
  const archivos = [];
  recorrer(DriveApp.getFolderById(CARPETA), [], archivos);
  return { fecha: new Date().toISOString(), archivos: archivos };
}

function recorrer(carpeta, ruta, archivos) {
  const it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const nombre = f.getName();
    if (oculto(nombre)) continue;
    const item = {
      id: f.getId(),
      nombre: nombre,
      tipo: f.getMimeType(),
      tam: f.getSize(),
      modificado: f.getLastUpdated().toISOString(),
      ruta: ruta,
    };
    // Los videos se guardan como un .txt con el link de YouTube adentro.
    if (/\.txt$/i.test(nombre)) {
      const texto = f.getBlob().getDataAsString();
      const link = (texto.match(/https?:\/\/\S+/) || [])[0];
      if (link) item.link = link.replace(/\\/g, '');
    }
    archivos.push(item);
  }
  const sub = carpeta.getFolders();
  while (sub.hasNext()) {
    const c = sub.next();
    if (oculto(c.getName())) continue;
    recorrer(c, ruta.concat(c.getName()), archivos);
  }
}

// Solo entrega archivos que estén dentro de la carpeta del catálogo.
function dentroDelCatalogo(archivo) {
  const pendientes = [];
  const padres = archivo.getParents();
  while (padres.hasNext()) pendientes.push(padres.next());
  const vistos = {};
  while (pendientes.length) {
    const c = pendientes.pop();
    if (c.getId() === CARPETA) return true;
    if (vistos[c.getId()]) continue;
    vistos[c.getId()] = true;
    const arriba = c.getParents();
    while (arriba.hasNext()) pendientes.push(arriba.next());
  }
  return false;
}

function archivo(id) {
  if (!id) throw new Error('Falta el archivo.');
  const f = DriveApp.getFileById(id);
  if (!dentroDelCatalogo(f) || oculto(f.getName())) throw new Error('Ese archivo no está en el catálogo.');
  if (f.getSize() > MAX_BYTES) throw new Error('El archivo es muy grande para enviarlo desde la app.');
  const blob = f.getBlob();
  return { nombre: f.getName(), tipo: blob.getContentType(), datos: Utilities.base64Encode(blob.getBytes()) };
}
