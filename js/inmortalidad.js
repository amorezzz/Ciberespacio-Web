/* =========================================================
   INMORTALIDAD.JS — solo para inmortalidad.html
   ---------------------------------------------------------
   Un chico camina en 4 frames (PNG con transparencia).
   Cada pulsación de tecla = un paso (máximo 24 pasos).

   → (o D, o clic en la mitad derecha): avanza un paso, mira a la
     derecha y el filtro PIXELADO (el mismo de la medusa en
     copias.js) aumenta el tamaño del píxel.
   ← (o A, o clic en la mitad izquierda): retrocede un paso, mira a
     la izquierda y el píxel vuelve a hacerse pequeño.

   El chico nunca se mueve de sitio: siempre está en el centro.
   ========================================================= */

// ---------- AJUSTES ----------
const PASOS_MAX = 24;            // número total de pasos / frames de la transformación

// Tamaño del píxel (en px del canvas) en el paso 1 y en el paso 24.
// Entre medias crece de forma exponencial → la transformación es
// muy suave al principio y se acelera al final.
const CELDA_MIN = 1.2;
const CELDA_MAX = 40;

// Mismos valores que el PIXELADO de la medusa (copias.js)
const PIXEL_NIVELES = 5;         // tonos por canal (menos = más "8 bits")
const REJILLA_DESDE = 4;         // la rejilla LED solo aparece con píxeles ≥ 4 px
                                 // (con píxeles diminutos taparía la imagen)

const INTERVALO_TECLA = 90;      // ms mínimos entre pasos si se deja la tecla pulsada

// Los 4 frames en orden de la caminata.
// anclaX = x del centro del torso en cada PNG: sirve para que el
// cuerpo quede siempre en el mismo punto aunque los PNG tengan anchos distintos.
const FRAMES = [
  { src: '../assets/chico_caminando1.png',   anclaX: 61 },
  { src: '../assets/chico_caminando2-1.png', anclaX: 155 },
  { src: '../assets/chico_caminando2.png',   anclaX: 190 },
  { src: '../assets/chico_caminando4.png',   anclaX: 261 },
];

// Tamaño interno del canvas (cabe el frame más ancho a ambos lados del ancla)
const ANCHO = 660;
const ALTO  = 930;

// ---------- ELEMENTOS ----------
const lienzo  = document.getElementById('chico-canvas');
const ctx     = lienzo.getContext('2d');
const hudPaso = document.getElementById('paso-num');
const hudInt  = document.getElementById('paso-integridad');
const escena  = document.querySelector('.stage');

lienzo.width = ANCHO;
lienzo.height = ALTO;

// Canvas fuera de pantalla: aquí se compone el frame a tamaño real
const base    = document.createElement('canvas');
base.width = ANCHO;
base.height = ALTO;
const baseCtx = base.getContext('2d');

// Canvas pequeño: aquí se reduce la imagen (cada píxel = un bloque)
const mini    = document.createElement('canvas');
const miniCtx = mini.getContext('2d', { willReadFrequently: true });

let imagenes = [];
let paso = 0;                    // 0 … PASOS_MAX
let ciclo = 0;                   // cuenta todos los pasos dados (elige el frame)
let mirandoIzquierda = false;
let ultimaTecla = 0;
let puedeLeerPixeles = true;     // false si el navegador bloquea getImageData (file://)


/* =========================================================
   TAMAÑO DEL PÍXEL SEGÚN EL PASO
   ========================================================= */
function celdaDelPaso(p) {
  if (p <= 0) return 1;          // paso 0 = imagen original
  const t = (p - 1) / (PASOS_MAX - 1);
  return CELDA_MIN * Math.pow(CELDA_MAX / CELDA_MIN, t);
}


/* =========================================================
   FILTRO PIXELADO (adaptado de copias.js para imágenes PNG
   con transparencia: el fondo se queda transparente)
   ========================================================= */
function pixelar(celda) {
  const cols = Math.ceil(ANCHO / celda);
  const fils = Math.ceil(ALTO / celda);
  mini.width = cols;
  mini.height = fils;
  miniCtx.drawImage(base, 0, 0, cols, fils);

  // Posterizado: cada canal redondeado a pocos niveles
  // y transparencia "todo o nada" para que los bordes sean píxeles duros
  if (puedeLeerPixeles) {
    try {
      const img = miniCtx.getImageData(0, 0, cols, fils);
      const d = img.data;
      const salto = 255 / (PIXEL_NIVELES - 1);
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.round(d[i]     / salto) * salto;
        d[i + 1] = Math.round(d[i + 1] / salto) * salto;
        d[i + 2] = Math.round(d[i + 2] / salto) * salto;
        d[i + 3] = d[i + 3] > 110 ? 255 : 0;
      }
      miniCtx.putImageData(img, 0, 0);
    } catch (e) {
      puedeLeerPixeles = false;
      console.warn('No se pueden leer los píxeles (¿abierto con file://?). Usa Live Server. El pixelado funciona pero sin posterizar.', e);
    }
  }

  // Ampliamos SIN suavizado → bordes de píxel duros
  ctx.clearRect(0, 0, ANCHO, ALTO);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mini, 0, 0, cols * celda, fils * celda);
  ctx.imageSmoothingEnabled = true;

  // Rejilla entre bloques (como una pantalla LED).
  // "destination-out" recorta líneas transparentes solo sobre el chico.
  if (celda >= REJILLA_DESDE) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    for (let x = 0; x < ANCHO; x += celda) ctx.fillRect(Math.round(x), 0, 1, ALTO);
    for (let y = 0; y < ALTO; y += celda) ctx.fillRect(0, Math.round(y), ANCHO, 1);
    ctx.restore();
  }
}


/* =========================================================
   DIBUJAR
   ========================================================= */
function dibujar() {
  const frame = FRAMES[ciclo % FRAMES.length];
  const img = imagenes[ciclo % FRAMES.length];

  // 1. Frame a tamaño real, con el torso en el centro y los pies abajo
  baseCtx.clearRect(0, 0, ANCHO, ALTO);
  baseCtx.drawImage(img, ANCHO / 2 - frame.anclaX, ALTO - img.naturalHeight);

  // 2. Filtro (o imagen original en el paso 0)
  if (paso === 0) {
    ctx.clearRect(0, 0, ANCHO, ALTO);
    ctx.drawImage(base, 0, 0);
  } else {
    pixelar(celdaDelPaso(paso));
  }

  // 3. Dirección: el espejo lo hace el CSS (.mira-izquierda)
  lienzo.classList.toggle('mira-izquierda', mirandoIzquierda);

  // 4. HUD
  hudPaso.textContent = `Paso ${String(paso).padStart(2, '0')}/${PASOS_MAX}`;
  hudInt.textContent  = `Integridad ${Math.round(100 - (paso / PASOS_MAX) * 100)}%`;
}


/* =========================================================
   CAMINAR
   ========================================================= */
function caminar(direccion) {           // +1 derecha, -1 izquierda
  mirandoIzquierda = direccion < 0;
  const siguiente = paso + direccion;
  // Dentro de los límites: da el paso. En los extremos solo se gira.
  if (siguiente >= 0 && siguiente <= PASOS_MAX) {
    paso = siguiente;
    ciclo++;
  }
  dibujar();
}

document.addEventListener('keydown', (e) => {
  let dir = 0;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 1;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') dir = -1;
  if (!dir) return;
  e.preventDefault();

  // Si se deja la tecla pulsada, no más rápido que INTERVALO_TECLA
  const ahora = performance.now();
  if (e.repeat && ahora - ultimaTecla < INTERVALO_TECLA) return;
  ultimaTecla = ahora;
  caminar(dir);
});

// Clic / toque (para móvil): mitad derecha avanza, mitad izquierda retrocede
escena.addEventListener('click', (e) => {
  caminar(e.clientX > window.innerWidth / 2 ? 1 : -1);
});


/* =========================================================
   ARRANQUE: cargamos los 4 PNG antes de pintar nada
   ========================================================= */
function cargar(src) {
  return new Promise((ok, error) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = error;
    img.src = src;
  });
}

Promise.all(FRAMES.map(f => cargar(f.src)))
  .then((lista) => {
    imagenes = lista;
    dibujar();
  })
  .catch((e) => console.error('No se ha podido cargar algún frame del chico:', e));
