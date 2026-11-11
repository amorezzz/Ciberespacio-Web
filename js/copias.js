/* =========================================================
   COPIAS.JS — solo para copias.html
   ---------------------------------------------------------
   Un único vídeo (assets/medusa.mp4) y un <canvas>.
   En cada fotograma pintamos el vídeo en el canvas pasándolo
   por el FILTRO activo. Cada clic en la página = siguiente filtro.
   Así solo se descarga UN vídeo y los filtros se calculan en vivo.

   Para añadir, quitar o reordenar filtros: toca la lista FILTROS
   (más abajo). Cada filtro es una función que dibuja un fotograma.
   ========================================================= */

// ---------- AJUSTES GENERALES ----------
const ANCHO_MAX = 1600;          // resolución máxima del canvas (rendimiento)
const DURACION_GLITCH = 280;     // ms de "interferencia" al cambiar de filtro

// ---------- ELEMENTOS ----------
const video   = document.getElementById('medusa');
const lienzo  = document.getElementById('medusa-canvas');
const ctx     = lienzo.getContext('2d');
const hudNum  = document.getElementById('copia-num');
const hudName = document.getElementById('copia-nombre');
const escena  = document.querySelector('.stage');

// Canvas pequeño fuera de pantalla: aquí se reduce el vídeo
// para leer sus colores con getImageData() (mucho más rápido que leerlo a tamaño real)
const mini    = document.createElement('canvas');
const miniCtx = mini.getContext('2d', { willReadFrequently: true });

let W = 0, H = 0;                // tamaño del canvas grande
let actual = 0;                  // índice del filtro activo
let glitchHasta = 0;             // momento en que termina la interferencia

// Reduce el fotograma actual a "ancho × alto" píxeles y devuelve sus colores.
// Cada píxel de la imagen reducida = media de color de esa zona del vídeo.
// (filtroCSS opcional, p. ej. 'blur(2px)', se aplica al reducir)
function leerVideo(ancho, alto, filtroCSS = 'none') {
  mini.width = ancho;            // (cambiar el tamaño reinicia el contexto)
  mini.height = alto;
  miniCtx.filter = filtroCSS;
  miniCtx.drawImage(video, 0, 0, ancho, alto);
  miniCtx.filter = 'none';
  return miniCtx.getImageData(0, 0, ancho, alto);
}

function fondoNegro() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
}

const brilloDe = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;


/* =========================================================
   1 · ORIGINAL — el vídeo tal cual
   ========================================================= */
function filtroOriginal() {
  ctx.drawImage(video, 0, 0, W, H);
}


/* =========================================================
   2 · PIXELADO — bloques grandes y paleta reducida (look 8 bits)
   ========================================================= */
const PIXEL_CELDA = 16;          // tamaño de cada bloque en px
const PIXEL_NIVELES = 5;         // tonos por canal (menos = más "8 bits")

function filtroPixelado() {
  const cols = Math.ceil(W / PIXEL_CELDA);
  const fils = Math.ceil(H / PIXEL_CELDA);
  const img = leerVideo(cols, fils);
  const d = img.data;

  // Posterizado: redondeamos cada canal a pocos niveles
  const paso = 255 / (PIXEL_NIVELES - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.round(d[i]     / paso) * paso;
    d[i + 1] = Math.round(d[i + 1] / paso) * paso;
    d[i + 2] = Math.round(d[i + 2] / paso) * paso;
  }
  miniCtx.putImageData(img, 0, 0);

  // Ampliamos SIN suavizado → bordes de píxel duros
  fondoNegro();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini, 0, 0, cols * PIXEL_CELDA, fils * PIXEL_CELDA);
  ctx.imageSmoothingEnabled = true;

  // Rejilla negra fina entre bloques (como una pantalla LED)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  for (let x = 0; x < W; x += PIXEL_CELDA) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += PIXEL_CELDA) ctx.fillRect(0, y, W, 1);
}


/* =========================================================
   3 · MATRIZ DE PUNTOS — otro pixelado: cada celda es un punto
       cuyo tamaño depende del brillo (trama de semitono)
   ========================================================= */
const PUNTO_CELDA = 10;          // separación entre puntos
const PUNTO_UMBRAL = 18;         // brillo mínimo para dibujar un punto
const PUNTO_REALCE = 1.5;        // aviva el color

function filtroPuntos() {
  const cols = Math.floor(W / PUNTO_CELDA);
  const fils = Math.floor(H / PUNTO_CELDA);
  const d = leerVideo(cols, fils).data;

  fondoNegro();
  for (let y = 0; y < fils; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const brillo = brilloDe(r, g, b);
      if (brillo < PUNTO_UMBRAL) continue;

      const radio = (PUNTO_CELDA / 2) * Math.sqrt(brillo / 255);
      ctx.fillStyle = `rgb(${Math.min(255, r * PUNTO_REALCE)}, ${Math.min(255, g * PUNTO_REALCE)}, ${Math.min(255, b * PUNTO_REALCE)})`;
      ctx.beginPath();
      ctx.arc(x * PUNTO_CELDA + PUNTO_CELDA / 2, y * PUNTO_CELDA + PUNTO_CELDA / 2, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}


/* =========================================================
   4 · ASCII — el mismo filtro de realidad.html (filtro-ascii.js)
       Ajustes idénticos para que las dos páginas se vean igual.
   ========================================================= */
const ASCII_CELDA = 12;
const ASCII_RAMPA = ' .:-=+o0O*#@';
const ASCII_UMBRAL_NEGRO = 22;
const ASCII_REALCE = 1.6;
const ASCII_CONTRASTE = 0.6;

function filtroASCII() {
  const cols = Math.floor(W / ASCII_CELDA);
  const fils = Math.floor(H / ASCII_CELDA);
  const d = leerVideo(cols, fils).data;

  fondoNegro();
  ctx.font = `${ASCII_CELDA}px 'Share Tech Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let y = 0; y < fils; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const brillo = brilloDe(r, g, b);
      if (brillo < ASCII_UMBRAL_NEGRO) continue;

      const nivel = Math.pow(brillo / 255, ASCII_CONTRASTE);
      const caracter = ASCII_RAMPA[Math.min(ASCII_RAMPA.length - 1, Math.floor(nivel * ASCII_RAMPA.length))];
      if (caracter === ' ') continue;

      ctx.fillStyle = `rgb(${Math.min(255, r * ASCII_REALCE)}, ${Math.min(255, g * ASCII_REALCE)}, ${Math.min(255, b * ASCII_REALCE)})`;
      ctx.fillText(caracter, x * ASCII_CELDA + ASCII_CELDA / 2, y * ASCII_CELDA + ASCII_CELDA / 2);
    }
  }
}


/* =========================================================
   5 · TV RETRO — tubo de rayos catódicos de los 80:
       canales RGB desplazados, líneas de barrido, ruido,
       una banda que "baja" por la pantalla y viñeta.
   ========================================================= */
const TV_ANCHO = 560;            // se calcula a esta resolución y se amplía (da el toque borroso)
const TV_RGB = 3;                // separación de los canales rojo/azul (en px de la versión pequeña)
const TV_RUIDO = 28;             // intensidad del grano
const TV_NEGRO = 14;             // el negro de una tele vieja nunca es negro del todo

function filtroTV(t) {
  const ancho = TV_ANCHO;
  const alto = Math.round(TV_ANCHO * H / W);
  const img = leerVideo(ancho, alto);
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);

  // Banda de interferencia que recorre la pantalla de arriba abajo
  const banda = ((t / 9) % (alto + 60)) - 30;

  for (let y = 0; y < alto; y++) {
    // Pequeño temblor horizontal de la imagen (más fuerte dentro de la banda)
    const enBanda = Math.abs(y - banda) < 12;
    const temblor = Math.round(Math.sin(y * 0.25 + t * 0.02) * (enBanda ? 6 : 0.6));
    // Líneas de barrido: una fila sí, una no, más oscura
    const barrido = (y % 2 === 0) ? 1 : 0.55;

    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      const xr = Math.min(ancho - 1, Math.max(0, x + temblor + TV_RGB));
      const xg = Math.min(ancho - 1, Math.max(0, x + temblor));
      const xb = Math.min(ancho - 1, Math.max(0, x + temblor - TV_RGB));
      const fila = y * ancho * 4;

      const ruido = (Math.random() - 0.5) * TV_RUIDO;
      const luz = enBanda ? 22 : 0;

      out[o]     = (src[fila + xr * 4]     + TV_NEGRO + ruido + luz) * barrido;
      out[o + 1] = (src[fila + xg * 4 + 1] + TV_NEGRO + ruido + luz) * barrido;
      out[o + 2] = (src[fila + xb * 4 + 2] + TV_NEGRO + ruido + luz) * barrido;
      out[o + 3] = 255;
    }
  }
  miniCtx.putImageData(new ImageData(out, ancho, alto), 0, 0);
  ctx.drawImage(mini, 0, 0, W, H);   // ampliado CON suavizado → imagen blanda de tubo

  // Viñeta: esquinas oscuras, como una pantalla curva
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}


/* =========================================================
   6 · CONTORNO — solo los bordes de la medusa, como un dibujo
       vectorial de pantalla de radar (detección de bordes Sobel)
   ========================================================= */
const CONTORNO_ANCHO = 720;      // resolución a la que se buscan los bordes
const CONTORNO_UMBRAL = 60;      // más alto = menos líneas, más limpias
const CONTORNO_COLOR = [255, 133, 46];   // naranja de la web (--orange)
const CONTORNO_SUAVIZADO = 'blur(1.5px)'; // suaviza el vídeo antes de buscar bordes (menos ruido)

const capaContorno = document.createElement('canvas');
const capaCtx = capaContorno.getContext('2d');

function filtroContorno() {
  const ancho = CONTORNO_ANCHO;
  const alto = Math.round(CONTORNO_ANCHO * H / W);
  const src = leerVideo(ancho, alto, CONTORNO_SUAVIZADO).data;

  // 1. Pasamos a escala de grises
  const gris = new Float32Array(ancho * alto);
  for (let i = 0, p = 0; i < src.length; i += 4, p++) {
    gris[p] = brilloDe(src[i], src[i + 1], src[i + 2]);
  }

  // 2. Sobel: mide cuánto cambia el brillo alrededor de cada píxel
  const out = new ImageData(ancho, alto);
  const o = out.data;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const p = y * ancho + x;
      const gx = -gris[p - ancho - 1] - 2 * gris[p - 1] - gris[p + ancho - 1]
                 + gris[p - ancho + 1] + 2 * gris[p + 1] + gris[p + ancho + 1];
      const gy = -gris[p - ancho - 1] - 2 * gris[p - ancho] - gris[p - ancho + 1]
                 + gris[p + ancho - 1] + 2 * gris[p + ancho] + gris[p + ancho + 1];
      const fuerza = Math.sqrt(gx * gx + gy * gy);
      if (fuerza < CONTORNO_UMBRAL) continue;

      const k = p * 4;
      o[k]     = CONTORNO_COLOR[0];
      o[k + 1] = CONTORNO_COLOR[1];
      o[k + 2] = CONTORNO_COLOR[2];
      o[k + 3] = Math.min(255, fuerza * 1.5);
    }
  }

  // 3. Dibujamos las líneas con un halo (glow) detrás
  capaContorno.width = ancho;
  capaContorno.height = alto;
  capaCtx.putImageData(out, 0, 0);

  fondoNegro();
  ctx.save();
  ctx.filter = 'blur(6px)';
  ctx.globalAlpha = 0.9;
  ctx.drawImage(capaContorno, 0, 0, W, H);   // halo
  ctx.restore();
  ctx.drawImage(capaContorno, 0, 0, W, H);   // línea nítida
}


/* =========================================================
   7 · ESTIRADO — la última columna de píxeles se arrastra
       hasta el borde (efecto "slit-scan" / glitch del prototipo)
   ========================================================= */
function filtroEstirado(t) {
  const vw = video.videoWidth, vh = video.videoHeight;
  // El punto de corte va y viene despacio por la mitad del vídeo
  const corte = 0.5 + 0.12 * Math.sin(t / 1400);
  const sx = Math.floor(vw * corte);
  const dx = Math.floor(W * corte);

  fondoNegro();
  ctx.drawImage(video, 0, 0, sx, vh, 0, 0, dx, H);          // parte izquierda normal
  ctx.drawImage(video, sx, 0, 2, vh, dx, 0, W - dx, H);     // 2 px estirados hasta el final
}


/* =========================================================
   LISTA DE FILTROS (el orden en que aparecen al hacer clic)
   ========================================================= */
const FILTROS = [
  { nombre: 'Original',          dibujar: filtroOriginal },
  { nombre: 'Pixelado',          dibujar: filtroPixelado },
  { nombre: 'Matriz de puntos',  dibujar: filtroPuntos },
  { nombre: 'ASCII',             dibujar: filtroASCII },
  { nombre: 'TV retro',          dibujar: filtroTV },
  { nombre: 'Contorno',          dibujar: filtroContorno },
  { nombre: 'Estirado',          dibujar: filtroEstirado },
];


/* =========================================================
   INTERFERENCIA al cambiar de copia: franjas desplazadas
   ========================================================= */
function glitch(fuerza) {
  for (let i = 0; i < 10; i++) {
    const y = Math.random() * H;
    const h = 4 + Math.random() * 50;
    const dx = (Math.random() - 0.5) * 140 * fuerza;
    ctx.drawImage(lienzo, 0, y, W, h, dx, y, W, h);
  }
  ctx.fillStyle = `rgba(255, 133, 46, ${0.08 * fuerza})`;
  ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 6);
}


/* =========================================================
   CAMBIO DE FILTRO
   ========================================================= */
function mostrarFiltro(n) {
  actual = (n + FILTROS.length) % FILTROS.length;
  glitchHasta = performance.now() + DURACION_GLITCH;
  const num = String(actual + 1).padStart(2, '0');
  const total = String(FILTROS.length).padStart(2, '0');
  hudNum.textContent = `Copia ${num}/${total}`;
  hudName.textContent = FILTROS[actual].nombre;
}

// Clic en cualquier parte de la página (debajo del menú) → siguiente copia
escena.addEventListener('click', () => mostrarFiltro(actual + 1));

// Teclado: flechas o espacio
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); mostrarFiltro(actual + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); mostrarFiltro(actual - 1); }
});


/* =========================================================
   BUCLE
   ========================================================= */
function bucle(t) {
  try {
    FILTROS[actual].dibujar(t);
  } catch (e) {
    // Pasa si abres el HTML con doble clic (file://): el navegador no deja leer el vídeo
    console.error('No se puede leer el vídeo. Abre la web con Live Server (no con doble clic / file://).', e);
    filtroOriginal();
  }

  const resta = glitchHasta - t;
  if (resta > 0) glitch(resta / DURACION_GLITCH);

  requestAnimationFrame(bucle);
}


/* =========================================================
   ARRANQUE
   ========================================================= */
async function iniciar() {
  await document.fonts.ready;    // Share Tech Mono para el ASCII
  const escala = Math.min(1, ANCHO_MAX / video.videoWidth);
  W = lienzo.width  = Math.round(video.videoWidth  * escala);
  H = lienzo.height = Math.round(video.videoHeight * escala);
  mostrarFiltro(0);
  glitchHasta = 0;               // sin interferencia en la primera carga
  video.play().catch(() => {});
  requestAnimationFrame(bucle);
}

if (video.readyState >= 1) {
  iniciar();
} else {
  video.addEventListener('loadedmetadata', iniciar, { once: true });
}
