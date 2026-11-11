/* =========================================================
   ADENTRATE.JS — solo para adentrate.html
   ---------------------------------------------------------
   La .stage se convierte en la cámara del usuario, pasada por
   el filtro PIXELADO (el mismo de copias.js / inmortalidad.js).

   El filtro depende del TIEMPO que el usuario lleva en el
   ciberespacio (el mismo contador del index, guardado en
   localStorage con la clave 'ciberespacio-tiempo'):
     · cada 30 s sube un nivel, hasta 24 niveles (= 12 minutos)
     · cada nivel → píxel más grande (crece igual que los pasos
       del chico caminando: exponencial, suave al principio)
     · cada nivel → la imagen se tiñe más con el MAPA DE DEGRADADO
       azul (azul marino → azul eléctrico → blanco)
   El tiempo sigue sumando mientras se está en esta página.
   ========================================================= */

// ---------- AJUSTES ----------
const NIVELES_MAX = 24;          // 24 niveles × 120 s = 48 minutos
const SEGUNDOS_POR_NIVEL = 120;

// Tamaño del píxel (en px de pantalla) en el nivel 1 y en el nivel 24.
// Igual que el chico: crecimiento exponencial entre medias.
const CELDA_MIN = 2;
const CELDA_MAX = 48;

const PIXEL_NIVELES = 5;         // tonos por canal (posterizado, look 8 bits)
const REJILLA_DESDE = 4;         // la rejilla LED aparece con píxeles ≥ 4 px

// MAPA DE DEGRADADO (como el de Photoshop): sombras → luces.
// pos = posición del color en el degradado (0 = negro de la imagen, 1 = blanco)
const DEGRADADO = [
  { pos: 0.00, color: [19, 32, 95] },    // #13205F azul marino
  { pos: 0.20, color: [26, 59, 181] },   // #1A3BB5 azul eléctrico
  { pos: 1.00, color: [255, 255, 255] }, // #FFFFFF blanco
];

const ANCHO_MAX = 1600;          // resolución máxima del canvas (rendimiento)
const STORAGE_KEY = 'ciberespacio-tiempo';   // misma clave que main.js

// ---------- ELEMENTOS ----------
const video    = document.getElementById('webcam');
const lienzo   = document.getElementById('webcam-canvas');
const ctx      = lienzo.getContext('2d');
const escena   = document.querySelector('.stage');
const hint     = document.getElementById('webcam-hint');
const hudNivel = document.getElementById('nivel-num');
const hudPixel = document.getElementById('nivel-pixel');
const hudSig   = document.getElementById('nivel-siguiente');
const hudTiempo = document.getElementById('nivel-tiempo');
const hudBarra = document.getElementById('nivel-barra');

// Canvas pequeño fuera de pantalla: aquí se reduce la imagen
const mini    = document.createElement('canvas');
const miniCtx = mini.getContext('2d', { willReadFrequently: true });

let W = 0, H = 0, escala = 1;    // tamaño interno del canvas y px de canvas por px de pantalla
let camaraLista = false;
let puedeLeerPixeles = true;


/* =========================================================
   TIEMPO EN EL CIBERESPACIO (continúa el contador del index)
   ========================================================= */
let guardado = 0;
try { guardado = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (e) {}
const inicio = Date.now();
const segundosTotales = () => guardado + Math.floor((Date.now() - inicio) / 1000);

const pad = n => String(n).padStart(2, '0');

function nivelActual() {
  return Math.min(NIVELES_MAX, Math.floor(segundosTotales() / SEGUNDOS_POR_NIVEL));
}

function celdaDelNivel(n) {
  if (n <= 0) return 1;          // nivel 0 = imagen original
  const t = (n - 1) / (NIVELES_MAX - 1);
  return CELDA_MIN * Math.pow(CELDA_MAX / CELDA_MIN, t);
}


/* =========================================================
   MAPA DE DEGRADADO: tabla de 256 colores (uno por brillo)
   ========================================================= */
const MAPA = new Uint8ClampedArray(256 * 3);
for (let b = 0; b < 256; b++) {
  const t = b / 255;
  let i = 0;
  while (i < DEGRADADO.length - 2 && t > DEGRADADO[i + 1].pos) i++;
  const a = DEGRADADO[i], z = DEGRADADO[i + 1];
  const f = Math.min(1, Math.max(0, (t - a.pos) / (z.pos - a.pos)));
  for (let c = 0; c < 3; c++) MAPA[b * 3 + c] = a.color[c] + (z.color[c] - a.color[c]) * f;
}


/* =========================================================
   TAMAÑO DEL CANVAS = tamaño de la .stage
   ========================================================= */
function ajustarTamano() {
  const r = escena.getBoundingClientRect();
  escala = Math.min(window.devicePixelRatio || 1, ANCHO_MAX / Math.max(1, r.width));
  W = lienzo.width  = Math.round(r.width * escala);
  H = lienzo.height = Math.round(r.height * escala);
}
window.addEventListener('resize', ajustarTamano);
ajustarTamano();

// Recorte tipo "cover": la parte del vídeo que llena la pantalla sin deformarse
function recorteCover() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const ratioV = vw / vh, ratioL = W / H;
  if (ratioV > ratioL) {
    const sw = vh * ratioL;
    return [(vw - sw) / 2, 0, sw, vh];
  }
  const sh = vw / ratioL;
  return [0, (vh - sh) / 2, vw, sh];
}


/* =========================================================
   DIBUJAR UN FOTOGRAMA
   ========================================================= */
function dibujar() {
  const nivel = nivelActual();
  const [sx, sy, sw, sh] = recorteCover();

  // Nivel 0: la cámara tal cual (en espejo, como un selfie)
  if (nivel === 0) {
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, W, 0);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
    ctx.restore();
    return;
  }

  const celda = celdaDelNivel(nivel) * escala;
  const cols = Math.ceil(W / celda);
  const fils = Math.ceil(H / celda);

  // 1. Reducimos la imagen (cada píxel = un bloque), en espejo
  if (mini.width !== cols || mini.height !== fils) {
    mini.width = cols;
    mini.height = fils;
  }
  miniCtx.setTransform(-1, 0, 0, 1, cols, 0);
  miniCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cols, fils);
  miniCtx.setTransform(1, 0, 0, 1, 0, 0);

  // 2. Posterizado + mapa de degradado azul (cada vez más fuerte)
  if (puedeLeerPixeles) {
    try {
      const img = miniCtx.getImageData(0, 0, cols, fils);
      const d = img.data;
      const salto = 255 / (PIXEL_NIVELES - 1);
      const mezcla = nivel / NIVELES_MAX;          // 0 → 1 a lo largo de los 12 min
      for (let i = 0; i < d.length; i += 4) {
        const r = Math.round(d[i]     / salto) * salto;
        const g = Math.round(d[i + 1] / salto) * salto;
        const b = Math.round(d[i + 2] / salto) * salto;
        // brillo del bloque → color del degradado
        const m = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * 3;
        d[i]     = r + (MAPA[m]     - r) * mezcla;
        d[i + 1] = g + (MAPA[m + 1] - g) * mezcla;
        d[i + 2] = b + (MAPA[m + 2] - b) * mezcla;
      }
      miniCtx.putImageData(img, 0, 0);
    } catch (e) {
      puedeLeerPixeles = false;
      console.warn('No se pueden leer los píxeles. El pixelado funciona, pero sin degradado.', e);
    }
  }

  // 3. Ampliamos SIN suavizado → bordes de píxel duros
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini, 0, 0, cols * celda, fils * celda);
  ctx.imageSmoothingEnabled = true;

  // 4. Rejilla negra fina entre bloques (pantalla LED)
  if (celda / escala >= REJILLA_DESDE) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    const grosor = Math.max(1, Math.round(escala));
    for (let x = 0; x < W; x += celda) ctx.fillRect(Math.round(x), 0, grosor, H);
    for (let y = 0; y < H; y += celda) ctx.fillRect(0, Math.round(y), W, grosor);
  }
}

function bucle() {
  if (camaraLista && video.readyState >= 2) dibujar();
  requestAnimationFrame(bucle);
}


/* =========================================================
   HUD (una vez por segundo) + guardar el tiempo
   ========================================================= */
function actualizarHud() {
  const t = segundosTotales();
  const nivel = nivelActual();
  try { localStorage.setItem(STORAGE_KEY, String(t)); } catch (e) {}

  hudNivel.textContent = `Nivel ${pad(nivel)}/${NIVELES_MAX}`;
  hudPixel.textContent = `Píxel ${nivel === 0 ? 1 : Math.round(celdaDelNivel(nivel))}px · Señal ${Math.round(100 - (nivel / NIVELES_MAX) * 100)}%`;

  if (nivel < NIVELES_MAX) {
    const falta = SEGUNDOS_POR_NIVEL - (t % SEGUNDOS_POR_NIVEL);
    hudSig.textContent = `Siguiente nivel en 00:${pad(falta)}`;
  } else {
    hudSig.textContent = 'Asimilación completa';
  }

  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  hudTiempo.textContent = `Tiempo en la red ${pad(h)}:${pad(m)}:${pad(s)}`;
  hudBarra.style.width = `${(nivel / NIVELES_MAX) * 100}%`;
}
actualizarHud();
setInterval(actualizarHud, 1000);


/* =========================================================
   ARRANQUE: pedimos la cámara
   ========================================================= */
function avisar(texto) {
  hint.textContent = texto;
  hint.classList.remove('is-hidden');
}

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  avisar('Tu navegador no permite usar la cámara (abre la web con Live Server o https)');
} else {
  navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false })
    .then(stream => {
      video.srcObject = stream;
      return video.play();
    })
    .then(() => {
      camaraLista = true;
      document.dispatchEvent(new Event('hint:ocultar'));
    })
    .catch(e => {
      console.error('No se ha podido acceder a la cámara:', e);
      avisar('Sin acceso a la cámara · permítelo para adentrarte');
    });
}

requestAnimationFrame(bucle);
