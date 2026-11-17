/* HD Interna · Datos compartidos en Firebase.
 * Si js/firebase-config.js tiene la configuración, la app entra con la cuenta de Google
 * y guarda todo en Firestore (todos ven lo mismo). Si no, sigue como versión de prueba
 * con los datos en el navegador (js/datos.js).
 * Mantiene la misma forma de uso que DB: la app lee de memoria y cada cambio se manda a Firestore;
 * los cambios de los demás llegan solos y se vuelve a dibujar la pantalla.
 */

const COLECCIONES_NUBE = ['usuarios', 'fichajes', 'correcciones', 'ausencias', 'vacaciones', 'precios', 'material', 'agenda', 'tareas', 'novedades', 'recordatorios', 'recibos'];
const VALORES_LOCALES = ['catalogo', 'catalogoNuevos'];  // copia del catálogo de Drive: queda en cada teléfono
const limpio = o => JSON.parse(JSON.stringify(o));     // Firestore no acepta "undefined"

const NUBE = {
  activa: !!(window.FIREBASE_CONFIG && window.firebase),
  estado: 'iniciando',   // iniciando | salida | cargando | sinAcceso | lista | error
  error: '',
  email: '',
  acceso: null,
  fs: null,
  auth: null,
  escuchas: [],
  _redibujar: null,

  iniciar() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.fs = firebase.firestore();
    try { this.fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* sin modo sin conexión */ }
    this.auth.getRedirectResult?.().catch(err => { this.estado = 'error'; this.error = err.message; render(); });
    this.auth.onAuthStateChanged(u => this.alEntrar(u).catch(err => {
      this.estado = 'error';
      this.error = err && err.message || String(err);
      render();
    }));
    render();
  },

  async alEntrar(u) {
    this.dejarDeEscuchar();
    yo = null;
    detalleAsistencia = null;
    if (!u) { this.estado = 'salida'; render(); return; }
    this.email = (u.email || '').toLowerCase();
    this.estado = 'cargando';
    render();
    let acc = await this.fs.doc('accesos/' + this.email).get();
    if (!acc.exists) {
      // La primera vez que entra Horacio se crea su acceso (las reglas solo se lo permiten a él).
      try {
        await this.fs.doc('accesos/' + this.email).set({ usuario: 'horacio', rol: 'director', email: this.email });
        acc = await this.fs.doc('accesos/' + this.email).get();
      } catch (e) { /* no es Horacio */ }
    }
    if (!acc.exists) { this.estado = 'sinAcceso'; render(); return; }
    this.acceso = acc.data();
    const director = this.acceso.rol === 'director';
    if (director && !(await this.fs.doc('ajustes/config').get()).exists) await this.sembrar();

    DB._datos = { config: {}, valores: {} };
    COLECCIONES_NUBE.forEach(c => { DB._datos[c] = []; });
    // Primero usuarios y ajustes (hacen falta para saber qué más puede ver cada uno).
    await Promise.all([this.escucharColeccion('usuarios'), this.escucharDoc('config'), this.escucharDoc('valores')]);
    yo = usuario(this.acceso.usuario);
    if (!yo || !yo.activo) { this.estado = 'sinAcceso'; yo = null; render(); return; }
    const otras = COLECCIONES_NUBE.filter(c => c !== 'usuarios' && !(c === 'precios' && !puede(yo, 'verPrecios')));
    await Promise.all(otras.map(c => this.escucharColeccion(c,
      c === 'recibos' && !director ? q => q.where('usuario', '==', yo.id) : null)));
    this.estado = 'lista';
    if (!location.hash) location.hash = '#inicio';
    render();
  },

  escucharColeccion(nombre, filtro) {
    return new Promise((ok, mal) => {
      let primera = true;
      const ref = this.fs.collection(nombre);
      const quitar = (filtro ? filtro(ref) : ref).onSnapshot(snap => {
        DB._datos[nombre] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        if (primera) { primera = false; ok(); } else this.cambio();
      }, err => { if (primera) { primera = false; mal(err); } });
      this.escuchas.push(quitar);
    });
  },

  escucharDoc(id) {
    return new Promise((ok, mal) => {
      let primera = true;
      const quitar = this.fs.doc('ajustes/' + id).onSnapshot(d => {
        DB._datos[id] = d.exists ? d.data() : {};
        if (primera) { primera = false; ok(); } else this.cambio();
      }, err => { if (primera) { primera = false; mal(err); } });
      this.escuchas.push(quitar);
    });
  },

  dejarDeEscuchar() {
    this.escuchas.forEach(f => { try { f(); } catch (e) { /* ya cerrada */ } });
    this.escuchas = [];
  },

  // Llegó un cambio de otra persona: se redibuja si no interrumpe lo que se está haciendo.
  cambio() {
    clearTimeout(this._redibujar);
    this._redibujar = setTimeout(() => {
      if (!yo || this.estado !== 'lista') return;
      const foco = document.activeElement;
      const escribiendo = foco && foco.closest && foco.closest('#app') && /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName);
      if (escribiendo || escaner || fotoFactura || reciboEnProceso || guardandoFactura) return;
      yo = usuario(yo.id) || yo;
      render();
    }, 300);
  },

  // Primera vez: se pasan a Firebase los ajustes (con los códigos QR ya impresos), los usuarios,
  // los precios y los recibos que Horacio tenía en este navegador. Los datos de ejemplo no se pasan.
  async sembrar() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { /* nada guardado */ }
    const base = datosIniciales();
    const config = (local && local.config) || base.config;
    if (!config.lugares) config.lugares = lugaresIniciales(config.tokenQR || 'HD-' + nuevoId());
    const usuarios = ((local && local.usuarios) || base.usuarios).map(u => u.id === 'horacio' ? { ...u, email: this.email } : u);
    const lote = this.fs.batch();
    lote.set(this.fs.doc('ajustes/config'), limpio(config));
    lote.set(this.fs.doc('ajustes/valores'), limpio({ preciosActualizados: (local && local.preciosActualizados) || hoyISO() }));
    usuarios.forEach(u => lote.set(this.fs.doc('usuarios/' + u.id), limpio(u)));
    ((local && local.precios) || base.precios).forEach(p => lote.set(this.fs.doc('precios/' + p.id), limpio(p)));
    lote.set(this.fs.doc('novedades/bienvenida'), { id: 'bienvenida', titulo: 'Bienvenidos a HD Interna', texto: 'Desde ahora todos vemos los mismos datos: fichajes, tareas, vacaciones y avisos.', autor: 'horacio', fecha: hoyISO() });
    await lote.commit();
    for (const r of (local && local.recibos) || []) {
      try { await this.fs.doc('recibos/' + r.id).set(limpio(r)); } catch (e) { /* recibo muy grande: se vuelve a cargar */ }
    }
  },

  entrar() {
    const proveedor = new firebase.auth.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    return this.auth.signInWithPopup(proveedor).catch(err => {
      if (/popup-blocked|operation-not-supported/.test(err.code || '')) return this.auth.signInWithRedirect(proveedor);
      if (/popup-closed|cancelled-popup/.test(err.code || '')) return;
      this.estado = 'error';
      this.error = err.message;
      render();
    });
  },

  salir() {
    this.dejarDeEscuchar();
    return this.auth.signOut();
  },

  // Escrituras (se mandan a Firestore; la pantalla ya muestra el cambio)
  set(col, item) { this.fs.collection(col).doc(item.id).set(limpio(item)).catch(e => this.falla(e)); },
  borrar(col, id) { this.fs.collection(col).doc(id).delete().catch(e => this.falla(e)); },
  ajustes(id, datos) { this.fs.doc('ajustes/' + id).set(limpio(datos), { merge: true }).catch(e => this.falla(e)); },
  falla(e) { toast('No se pudo guardar: ' + (/permission/i.test(e.code || e.message) ? 'no tenés permiso para eso' : 'revisá la conexión')); },

  // Permiso de entrada de cada persona (lo maneja Horacio en Usuarios y ajustes).
  async guardarAcceso(u, emailAnterior) {
    const email = (u.email || '').trim().toLowerCase();
    if (emailAnterior && emailAnterior !== email) await this.fs.doc('accesos/' + emailAnterior).delete();
    if (email) await this.fs.doc('accesos/' + email).set({ usuario: u.id, rol: u.rol, email });
  },
};

// Con Firebase activo, DB guarda en la nube en vez del navegador.
if (NUBE.activa) {
  Object.assign(DB, {
    cargar() {},
    guardar() { return true; },
    reiniciar() {},
    setConfig(cambios) { Object.assign(this._datos.config, cambios); NUBE.ajustes('config', cambios); },
    agregar(coleccion, item) {
      const nuevo = { id: nuevoId(), ...item };
      this._datos[coleccion].push(nuevo);
      NUBE.set(coleccion, nuevo);
      return nuevo;
    },
    actualizar(coleccion, id, cambios) {
      const item = this.buscar(coleccion, id);
      if (item) { Object.assign(item, cambios); NUBE.set(coleccion, item); }
      return item;
    },
    borrar(coleccion, id) {
      this._datos[coleccion] = this._datos[coleccion].filter(x => x.id !== id);
      NUBE.borrar(coleccion, id);
    },
    valor(clave) {
      if (VALORES_LOCALES.includes(clave)) { try { return JSON.parse(localStorage.getItem('hdapp-' + clave)); } catch (e) { return null; } }
      return this._datos.valores[clave];
    },
    setValor(clave, v) {
      if (VALORES_LOCALES.includes(clave)) { try { localStorage.setItem('hdapp-' + clave, JSON.stringify(v)); } catch (e) { /* sin lugar */ } return; }
      this._datos.valores[clave] = v;
      NUBE.ajustes('valores', { [clave]: v });
    },
  });
  Object.defineProperty(DB, 'config', { get() { return this._datos.config; }, configurable: true });
}
