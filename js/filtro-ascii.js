/* =========================================================
    Filtro ASCII en tiempo real
   ---------------------------------------------------------
   Idea: el mismo vídeo se pinta dos veces.
   · A la izquierda del slider, el <video> tal cual.
   · A la derecha, un <canvas> donde, en cada fotograma,
     convertimos el vídeo en letras.
 
   Cómo se convierte un fotograma en ASCII:
   1. Dividimos la imagen en una rejilla de celdas (p. ej. 12×12 px).
   2. Dibujamos el fotograma en un canvas MINÚSCULO, de una
      columna por celda (p. ej. 160×90). Al reducirlo, el navegador
      hace la media de color de cada celda por nosotros.
   3. Leemos esos píxeles con getImageData() → r, g, b de cada celda.
   4. Calculamos el brillo de la celda (0 = negro, 255 = blanco).
   5. Según el brillo elegimos un carácter de una "rampa"
      ordenada de menos a más tinta:  " .:-=+o0O*#@"
   6. Escribimos ese carácter con fillText() en el canvas grande,
      del color original del píxel.
   Se repite en cada fotograma, así que el ASCII se mueve con el vídeo.
   ========================================================= */
 
// ---------- AJUSTES (toca aquí para cambiar el aspecto) ----------
const CELDA = 12;                       // tamaño de cada carácter en px (más pequeño = más detalle)
const RAMPA = ' .:-=+o0O*#@';           // de oscuro a claro
const UMBRAL_NEGRO = 22;                // por debajo de este brillo no se dibuja nada (fondo negro limpio)
const MODO_COLOR = 'original';          // 'original' = color del vídeo · 'naranja' = color de la web
const REALCE = 1.6;                     // multiplica el color para que brille más sobre negro
const CONTRASTE = 0.6;                  // <1 = más caracteres "gordos" (0, O, #, @) · 1 = lineal
const ANCHO_MAX = 1600;                 // resolución máxima del canvas (rendimiento)
 
// ---------- ELEMENTOS ----------
const video  = document.getElementById('video-real');
const lienzo = document.getElementById('video-ascii');
const ctx    = lienzo.getContext('2d');
 
// Canvas pequeño fuera de pantalla: aquí se reduce el vídeo a 1 px por celda
const mini    = document.createElement('canvas');
const miniCtx = mini.getContext('2d', { willReadFrequently: true });
 
let columnas = 0;
let filas = 0;
 
// ---------- PREPARAR TAMAÑOS ----------
// El canvas grande tiene la misma proporción que el vídeo,
// así con object-fit: cover (CSS) queda alineado al píxel con el <video>.
function prepararLienzo() {
  const escala = Math.min(1, ANCHO_MAX / video.videoWidth);
  lienzo.width  = Math.round(video.videoWidth  * escala);
  lienzo.height = Math.round(video.videoHeight * escala);
 
  columnas = Math.floor(lienzo.width  / CELDA);
  filas    = Math.floor(lienzo.height / CELDA);
  mini.width  = columnas;
  mini.height = filas;
 
  ctx.font = `${CELDA}px 'Share Tech Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}
 
// ---------- CONVERTIR UN FOTOGRAMA ----------
function dibujarASCII() {
  // 2. Reducimos el fotograma: cada píxel de "mini" = media de una celda
  miniCtx.drawImage(video, 0, 0, columnas, filas);
 
  let pixeles;
  try {
    // 3. Leemos los colores
    pixeles = miniCtx.getImageData(0, 0, columnas, filas).data;
  } catch (e) {
    console.error('No se puede leer el vídeo. Abre la web con Live Server (no con doble clic / file://).', e);
    return false;
  }
 
  // Fondo negro
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
 
  for (let y = 0; y < filas; y++) {
    for (let x = 0; x < columnas; x++) {
      const i = (y * columnas + x) * 4;      // cada píxel ocupa 4 valores: r, g, b, a
      const r = pixeles[i];
      const g = pixeles[i + 1];
      const b = pixeles[i + 2];
 
      // 4. Brillo percibido (el ojo ve el verde más claro que el azul)
      const brillo = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brillo < UMBRAL_NEGRO) continue;    // celda oscura → se queda en negro
 
      // 5. Elegimos carácter según el brillo
      //    (elevamos a CONTRASTE para que los tonos medios usen caracteres más densos)
      const nivel  = Math.pow(brillo / 255, CONTRASTE);   // 0 … 1
      const indice = Math.min(RAMPA.length - 1, Math.floor(nivel * RAMPA.length));
      const caracter = RAMPA[indice];
      if (caracter === ' ') continue;
 
      // 6. Color y dibujo
      if (MODO_COLOR === 'naranja') {
        ctx.fillStyle = `rgba(255, 133, 46, ${0.35 + brillo / 400})`;
      } else {
        ctx.fillStyle = `rgb(${Math.min(255, r * REALCE)}, ${Math.min(255, g * REALCE)}, ${Math.min(255, b * REALCE)})`;
      }
      ctx.fillText(caracter, x * CELDA + CELDA / 2, y * CELDA + CELDA / 2);
    }
  }
  return true;
}
 
// ---------- BUCLE ----------
// requestVideoFrameCallback se ejecuta solo cuando hay un fotograma nuevo
// (más eficiente). Si el navegador no lo tiene, usamos requestAnimationFrame.
function bucle() {
  if (!dibujarASCII()) return;
  if ('requestVideoFrameCallback' in video) {
    video.requestVideoFrameCallback(bucle);
  } else {
    requestAnimationFrame(bucle);
  }
}
 
// ---------- ARRANQUE ----------
async function iniciar() {
  await document.fonts.ready;     // esperamos a Share Tech Mono para el canvas
  prepararLienzo();
  bucle();
  // Algunos navegadores bloquean el autoplay: lo forzamos (está en silencio)
  video.play().catch(() => {});
}
 
if (video.readyState >= 1) {
  iniciar();
} else {
  video.addEventListener('loadedmetadata', iniciar, { once: true });
}