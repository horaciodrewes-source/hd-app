/* HD Interna · Escanear facturas en papel.
 * Foto con la cámara → la app busca sola los bordes del papel y lo endereza
 * (las esquinas se pueden corregir con el dedo) → PDF → carpeta de Drive
 * "00 Fact proveedores", con nombre automático (fecha, hora y quién la escaneó).
 * Se carga antes que app.js; usa sus funciones ($, esc, toast, yo, urlCatalogo…) recién al usarse.
 */

let paginasFactura = [];   // páginas ya recortadas: { url (jpeg dataURL), w, h }
let fotoFactura = null;    // foto que se está ajustando: { lienzo, esquinas: [{x,y}×4] }
let guardandoFactura = false;

const MAX_FOTO = 2400;     // lado mayor con el que se trabaja la foto (px)
const MAX_PAGINA = 1800;   // lado mayor de la página recortada (px)

function vistaFactura() {
  if (fotoFactura) {
    return `<h1>Escanear factura</h1>
    <div class="card">
      <p class="muted" style="margin-top:0">Si el recuadro no quedó justo sobre la factura, arrastrá los puntos a las esquinas del papel.</p>
      <div class="fac-ajuste"><canvas id="fac-lienzo"></canvas></div>
      <div class="row" style="margin-top:12px">
        <button class="primary" id="fac-usar">Usar esta página</button>
        <button id="fac-otra-foto">Sacar de nuevo</button>
      </div>
    </div>`;
  }
  const n = paginasFactura.length;
  return `<h1>Escanear factura</h1>
  <div class="card">
    ${n ? `<div class="fac-paginas">${paginasFactura.map((p, i) => `
      <figure><img src="${p.url}" alt="Página ${i + 1}"><figcaption>Pág. ${i + 1} <button class="mini" data-quitar="${i}">Quitar</button></figcaption></figure>`).join('')}</div>`
      : '<p class="muted" style="margin-top:0">Apoyá la factura sobre una mesa, mejor si el fondo es oscuro, y sacale una foto. Si tiene varias hojas, sacá una foto por hoja.</p>'}
    <div class="row" style="margin-top:12px">
      <label class="btn${n ? '' : ' btn-primary'} fac-btn-foto">📷 ${n ? 'Agregar otra hoja' : 'Sacar foto'}
        <input id="fac-foto" type="file" accept="image/*" capture="environment" hidden>
      </label>
      ${n ? `<button class="primary" id="fac-guardar" ${guardandoFactura ? 'disabled' : ''}>${guardandoFactura ? 'Guardando…' : `Guardar en Drive (${n} ${n === 1 ? 'hoja' : 'hojas'})`}</button>
      <button id="fac-descartar" ${guardandoFactura ? 'disabled' : ''}>Descartar</button>` : ''}
    </div>
    <div id="fac-msg"></div>
  </div>`;
}

function conectarFactura() {
  if (fotoFactura) { conectarAjuste(); return; }
  const input = $('#fac-foto');
  if (input) input.onchange = async () => {
    const archivo = input.files[0];
    if (!archivo) return;
    try {
      const lienzo = await cargarFoto(archivo);
      fotoFactura = { lienzo, esquinas: detectarBordes(lienzo) };
      render();
    } catch (err) {
      toast('No se pudo abrir la foto');
    }
  };
  document.querySelectorAll('[data-quitar]').forEach(b => b.onclick = () => {
    paginasFactura.splice(Number(b.dataset.quitar), 1);
    render();
  });
  if ($('#fac-descartar')) $('#fac-descartar').onclick = () => { paginasFactura = []; render(); };
  if ($('#fac-guardar')) $('#fac-guardar').onclick = guardarFactura;
}

// ---------- Foto y ajuste de esquinas ----------

async function cargarFoto(archivo) {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const k = Math.min(1, MAX_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function conectarAjuste() {
  const vista = $('#fac-lienzo');
  const { lienzo, esquinas } = fotoFactura;
  const ancho = vista.parentElement.clientWidth;
  const escala = Math.min(ancho / lienzo.width, (window.innerHeight * 0.65) / lienzo.height);
  const dpr = window.devicePixelRatio || 1;
  vista.style.width = Math.round(lienzo.width * escala) + 'px';
  vista.style.height = Math.round(lienzo.height * escala) + 'px';
  vista.width = Math.round(lienzo.width * escala * dpr);
  vista.height = Math.round(lienzo.height * escala * dpr);
  const ctx = vista.getContext('2d');
  const k = escala * dpr;

  const dibujar = () => {
    ctx.drawImage(lienzo, 0, 0, vista.width, vista.height);
    ctx.beginPath();
    esquinas.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, p.x * k, p.y * k));
    ctx.closePath();
    ctx.fillStyle = 'rgba(15,76,129,.18)';
    ctx.fill();
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = '#2f8cff';
    ctx.stroke();
    esquinas.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, 13 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.fill();
      ctx.stroke();
    });
  };
  dibujar();

  let arrastrando = -1;
  const punto = e => {
    const r = vista.getBoundingClientRect();
    return { x: (e.clientX - r.left) / escala, y: (e.clientY - r.top) / escala };
  };
  vista.onpointerdown = e => {
    const p = punto(e);
    let mejor = -1, dist = 45 / escala;  // 45 px de pantalla alrededor del punto
    esquinas.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dist) { dist = d; mejor = i; } });
    if (mejor < 0) return;
    arrastrando = mejor;
    vista.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  vista.onpointermove = e => {
    if (arrastrando < 0) return;
    const p = punto(e);
    esquinas[arrastrando] = { x: Math.max(0, Math.min(lienzo.width, p.x)), y: Math.max(0, Math.min(lienzo.height, p.y)) };
    dibujar();
  };
  vista.onpointerup = vista.onpointercancel = () => { arrastrando = -1; };

  $('#fac-otra-foto').onclick = () => { fotoFactura = null; render(); setTimeout(() => $('#fac-foto')?.click(), 50); };
  $('#fac-usar').onclick = () => {
    const pagina = enderezar(lienzo, esquinas);
    mejorarContraste(pagina);
    paginasFactura.push({ url: pagina.toDataURL('image/jpeg', 0.8), w: pagina.width, h: pagina.height });
    fotoFactura = null;
    render();
  };
}

// ---------- Detección de bordes (papel claro sobre fondo) ----------

function detectarBordes(lienzo) {
  const k = Math.min(1, 400 / Math.max(lienzo.width, lienzo.height));
  const w = Math.max(1, Math.round(lienzo.width * k)), h = Math.max(1, Math.round(lienzo.height * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(lienzo, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const n = w * h;
  const lum = new Uint8Array(n);
  const hist = new Array(256).fill(0);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    // el papel es claro y poco saturado: se castiga el color para separarlo de mesas claras de madera
    const v = Math.max(0, Math.round(0.299 * r + 0.587 * g + 0.114 * b - 0.5 * (Math.max(r, g, b) - Math.min(r, g, b))));
    lum[i] = v; hist[v]++;
  }
  const umbral = otsu(hist, n);
  // componente clara más grande
  const marca = new Int32Array(n).fill(-1);
  const pila = new Int32Array(n);
  let mejor = -1, mejorTam = 0;
  for (let s = 0; s < n; s++) {
    if (marca[s] !== -1 || lum[s] <= umbral) continue;
    let tope = 0, tam = 0;
    pila[tope++] = s; marca[s] = s;
    while (tope) {
      const i = pila[--tope]; tam++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && marca[i - 1] === -1 && lum[i - 1] > umbral) { marca[i - 1] = s; pila[tope++] = i - 1; }
      if (x < w - 1 && marca[i + 1] === -1 && lum[i + 1] > umbral) { marca[i + 1] = s; pila[tope++] = i + 1; }
      if (y > 0 && marca[i - w] === -1 && lum[i - w] > umbral) { marca[i - w] = s; pila[tope++] = i - w; }
      if (y < h - 1 && marca[i + w] === -1 && lum[i + w] > umbral) { marca[i + w] = s; pila[tope++] = i + w; }
    }
    if (tam > mejorTam) { mejorTam = tam; mejor = s; }
  }
  const margen = (W, H) => [{ x: W * 0.05, y: H * 0.05 }, { x: W * 0.95, y: H * 0.05 }, { x: W * 0.95, y: H * 0.95 }, { x: W * 0.05, y: H * 0.95 }];
  // si no hay una mancha clara clara (fondo blanco o foto muy oscura), se propone casi toda la foto
  if (mejor < 0 || mejorTam < n * 0.08 || mejorTam > n * 0.97) return margen(lienzo.width, lienzo.height);
  let tl = null, tr = null, br = null, bl = null;
  let sMin = Infinity, sMax = -Infinity, dMin = Infinity, dMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (marca[i] !== mejor) continue;
    const x = i % w, y = (i - x) / w;
    const s = x + y, d = x - y;
    if (s < sMin) { sMin = s; tl = { x, y }; }
    if (s > sMax) { sMax = s; br = { x, y }; }
    if (d > dMax) { dMax = d; tr = { x, y }; }
    if (d < dMin) { dMin = d; bl = { x, y }; }
  }
  return [tl, tr, br, bl].map(p => ({ x: (p.x + 0.5) / k, y: (p.y + 0.5) / k }));
}

function otsu(hist, total) {
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaB = 0, pesoB = 0, mejor = 0, umbral = 128;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    sumaB += t * hist[t];
    const mB = sumaB / pesoB, mF = (suma - sumaB) / pesoF;
    const v = pesoB * pesoF * (mB - mF) * (mB - mF);
    if (v > mejor) { mejor = v; umbral = t; }
  }
  return umbral;
}

// ---------- Enderezar (perspectiva) y mejorar ----------

// Homografía que lleva el rectángulo (0,0)-(W,H) a las 4 esquinas de la foto.
function homografia(W, H, q) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = src[i], { x, y } = q[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {  // eliminación gaussiana
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]).concat(1);
}

function ordenarEsquinas(q) {
  // arriba-izq, arriba-der, abajo-der, abajo-izq, aunque el usuario las haya cruzado
  const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const ord = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let i0 = 0;
  ord.forEach((p, i) => { if (p.x + p.y < ord[i0].x + ord[i0].y) i0 = i; });
  return [0, 1, 2, 3].map(i => ord[(i0 + i) % 4]);
}

function enderezar(lienzo, esquinas) {
  const q = ordenarEsquinas(esquinas);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let H = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const k = Math.min(1, MAX_PAGINA / Math.max(W, H));
  W = Math.max(1, Math.round(W * k)); H = Math.max(1, Math.round(H * k));
  const m = homografia(W, H, q);
  const sw = lienzo.width, sh = lienzo.height;
  const src = lienzo.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const d = img.data;
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const z = m[6] * u + m[7] * v + 1;
      let x = (m[0] * u + m[1] * v + m[2]) / z, y = (m[3] * u + m[4] * v + m[5]) / z;
      x = Math.max(0, Math.min(sw - 1.001, x)); y = Math.max(0, Math.min(sh - 1.001, y));
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (v * W + u) * 4;
      for (let c = 0; c < 3; c++) {
        d[o + c] = (src[i00 + c] * (1 - fx) + src[i10 + c] * fx) * (1 - fy) + (src[i01 + c] * (1 - fx) + src[i11 + c] * fx) * fy;
      }
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Blanco y negro con fondo blanco parejo, para que se lea como un escaneo.
function mejorarContraste(c) {
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, n = c.width * c.height;
  const gris = new Uint8Array(n);
  for (let i = 0; i < n; i++) gris[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  // fondo local (para sacar sombras): máximo en bloques de 32 px, suavizado
  const B = 32, bw = Math.ceil(c.width / B), bh = Math.ceil(c.height / B);
  const fondo = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const vals = [];
    for (let y = by * B; y < Math.min(c.height, (by + 1) * B); y += 2)
      for (let x = bx * B; x < Math.min(c.width, (bx + 1) * B); x += 2) vals.push(gris[y * c.width + x]);
    vals.sort((a, b) => a - b);
    fondo[by * bw + bx] = Math.max(60, vals[Math.floor(vals.length * 0.9)] || 255);
  }
  const suave = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = bx + dx, y = by + dy;
      if (x >= 0 && y >= 0 && x < bw && y < bh) { s += fondo[y * bw + x]; k++; }
    }
    suave[by * bw + bx] = s / k;
  }
  for (let y = 0; y < c.height; y++) {
    const fy = Math.min(bh - 1, Math.max(0, y / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < c.width; x++) {
      const fx = Math.min(bw - 1, Math.max(0, x / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
      const f = (suave[y0 * bw + x0] * (1 - tx) + suave[y0 * bw + x1] * tx) * (1 - ty) + (suave[y1 * bw + x0] * (1 - tx) + suave[y1 * bw + x1] * tx) * ty;
      let v = gris[y * c.width + x] / f;               // 1 = papel
      v = Math.max(0, Math.min(1, (v - 0.35) / 0.55)); // estira el contraste
      const g = Math.round(255 * Math.pow(v, 1.4));
      const o = (y * c.width + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = g;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------- PDF y Drive ----------

function nombreFactura() {
  const a = new Date();
  const dos = n => String(n).padStart(2, '0');
  return `${a.getFullYear()}-${dos(a.getMonth() + 1)}-${dos(a.getDate())} ${dos(a.getHours())}-${dos(a.getMinutes())} Factura (${nombreCorto(yo.id)}).pdf`;
}

async function pdfFactura() {
  const doc = await PDFLib.PDFDocument.create();
  for (const p of paginasFactura) {
    const jpg = await doc.embedJpg(Uint8Array.from(atob(p.url.split(',')[1]), ch => ch.charCodeAt(0)));
    const ancho = 595, alto = Math.round(595 * p.h / p.w);  // ancho A4, alto según la hoja
    doc.addPage([ancho, alto]).drawImage(jpg, { x: 0, y: 0, width: ancho, height: alto });
  }
  return doc.save();
}

function aBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function guardarFactura() {
  const msg = $('#fac-msg');
  if (!window.PDFLib) { msg.innerHTML = '<div class="notice bad">No se pudo cargar el armador de PDF. Revisá la conexión.</div>'; return; }
  if (!urlCatalogo()) { msg.innerHTML = '<div class="notice bad">Falta conectar la app con Drive. Avisale a Horacio.</div>'; return; }
  guardandoFactura = true;
  render();
  let error = null, guardada = null;
  try {
    const bytes = await pdfFactura();
    const r = await fetch(urlCatalogo(), {
      method: 'POST',
      body: JSON.stringify({ accion: 'subirFactura', nombre: nombreFactura(), datos: aBase64(bytes) }),
    });
    const datos = await r.json();
    if (datos.error) throw new Error(datos.error);
    guardada = datos.nombre;
  } catch (err) {
    error = err;
  }
  guardandoFactura = false;
  if (guardada) paginasFactura = [];
  render();
  const m = $('#fac-msg');
  if (!m) return;
  m.innerHTML = guardada
    ? `<div class="notice ok">Listo, guardada en Drive (00 Fact proveedores) como <b>${esc(guardada)}</b>.</div>`
    : `<div class="notice bad">No se pudo guardar${error && error.message && !/fetch|json|network/i.test(error.message) ? ': ' + esc(error.message) : '. Revisá la conexión y probá de nuevo; las hojas siguen acá'}.</div>`;
}
