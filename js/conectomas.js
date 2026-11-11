(() => {
  'use strict';

  /* ==========================================================================
     AJUSTES RÁPIDOS
     ========================================================================== */
  const AJUSTES = {
    paso: 0.5,                  // radianes que gira la hélice entre peldaño y peldaño
    desfase: 0.78 * Math.PI,    // separación entre las dos hebras (como el surco del ADN)
    inclinacion: 0.55,          // cuánto se inclinan los peldaños (en "separaciones")
    tolerancia: 26,             // px: lo cerca que hay que soltar del punto
    durPulso: 1.9,              // s: la corriente recorre la hélice
    durGlitch: 1.6,             // s: la hélice se corta y se copia por la pantalla
    velFinal: 70,               // px/s: velocidad de la hélice infinita del final
    neuronas: 166000,           // contador final (conectoma del macho de Drosophila)
  };

  // Colores (los mismos tonos que el resto de la web)
  const AZUL = [64, 150, 255];
  const AMARILLO = [255, 182, 46];

  const canvas = document.getElementById('cone');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('coneHud');
  const hint = document.getElementById('coneHint');
  const panel = document.getElementById('coneData');
  const contador = document.getElementById('coneContador');
  const btnReset = document.getElementById('coneReset');
  const texto = document.querySelector('.cone-texto');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Segundo canvas (invisible) donde se dibuja la escena "limpia";
  // luego se copia al visible, entero o cortado en tiras (glitch).
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d');

  /* ==========================================================================
     1. SPRITES: el punto difuminado se dibuja una vez y se reutiliza
     ========================================================================== */
  function crearSprite(nucleo, medio) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, nucleo);
    rg.addColorStop(0.42, medio);
    rg.addColorStop(0.62, medio.replace(/[\d.]+\)$/, '0.35)'));
    rg.addColorStop(1, medio.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return c;
  }
  const spriteAzul = crearSprite('rgba(150,225,255,1)', 'rgba(56,168,255,1)');
  const spriteAmarillo = crearSprite('rgba(255,245,210,1)', 'rgba(255,182,46,1)');

  /* ==========================================================================
     2. MEDIDAS: dónde va la hélice según el tamaño de la pantalla
     ========================================================================== */
  let W = 0, H = 0, dpr = 1;
  const L = { sep: 70, x0: 0, cy: 0, A: 100, R: 14, N: 9, movil: false, texDer: 0 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function medir() {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [canvas, buf]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }

    L.movil = W < 900;
    L.sep = L.movil ? clamp(W / 8.5, 34, 60) : clamp(W * 0.045, 52, 84);

    // Zona libre: a la derecha del texto (escritorio) o debajo (móvil)
    let izq = 24;
    if (!L.movil && texto) {
      const t = texto.getBoundingClientRect();
      L.texDer = t.right - r.left;
      izq = Math.max(L.texDer + 70, W * 0.34);
    }
    const der = W - (L.movil ? 24 : 70) - AJUSTES.inclinacion * L.sep;
    const N = clamp(Math.floor((der - izq) / L.sep) + 1, 5, 12);

    // Si cambia el número de parejas, se conservan las que ya estaban unidas
    if (N !== L.N || !conexiones.length) {
      const antes = conexiones;
      conexiones = Array.from({ length: N }, (_, k) => !!antes[k]);
      flashes = Array.from({ length: N }, () => -10);
    }
    L.N = N;
    L.x0 = izq + ((der - izq) - (N - 1) * L.sep) / 2;
    L.cy = L.movil ? H * 0.66 : H * 0.47;
    L.A = L.movil ? Math.min(H * 0.13, 110) : clamp(H * 0.17, 70, 150);
    L.R = L.movil ? 12 : clamp(L.sep * 0.25, 13, 21);
    actualizarHud();
  }

  /* ==========================================================================
     3. GEOMETRÍA DE LA HÉLICE
     Cada peldaño k tiene un punto en la hebra A y otro en la hebra B.
     La misma fórmula sirve para la hélice del juego (k = 0…N-1)
     y para la hélice infinita del final (cualquier k).
     ========================================================================== */
  let giro = 0;        // rotación de la hélice (radianes)
  let scroll = 0;      // desplazamiento horizontal (final)

  function punto(k, hebra) {
    const th = giro + k * AJUSTES.paso + (hebra === 'B' ? AJUSTES.desfase : 0);
    const x = L.x0 + k * L.sep - scroll + (hebra === 'B' ? AJUSTES.inclinacion * L.sep : 0);
    const z = Math.cos(th);                      // -1 = al fondo · 1 = delante
    return {
      x,
      y: L.cy + L.A * Math.sin(th),
      z,
      r: L.R * (0.7 + 0.3 * (z + 1) / 2),
      a: 0.6 + 0.4 * (z + 1) / 2,
    };
  }

  /* ==========================================================================
     4. ESTADO
     ========================================================================== */
  let estado = 'jugando';          // jugando → pulso → glitch → final
  let conexiones = [];             // true si el peldaño k ya está unido
  let flashes = [];                // momento en que se unió cada peldaño (destello)
  let tEstado = 0;                 // momento en que empezó el estado actual
  let drag = null;                 // { k, hebra, movido } mientras se arrastra
  let retraccion = null;           // línea que vuelve a su punto si se suelta mal
  let hover = null;
  const ptr = { x: -999, y: -999, dx: 0, dy: 0 };
  let ahora = 0;

  const unidas = () => conexiones.filter(Boolean).length;
  const dos = n => String(n).padStart(2, '0');

  function actualizarHud() {
    if (estado !== 'jugando') return;
    hud.textContent = `${dos(unidas())}/${dos(L.N)} sinapsis`;
  }

  /* ==========================================================================
     5. INTERACCIÓN (ratón y táctil con Pointer Events)
     ========================================================================== */
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Punto libre (sin unir) más cercano al cursor, o null
  function puntoEn(x, y) {
    let mejor = null, dMin = Infinity;
    for (let k = 0; k < L.N; k++) {
      if (conexiones[k]) continue;
      for (const hebra of ['A', 'B']) {
        const p = punto(k, hebra);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < Math.max(AJUSTES.tolerancia, p.r * 1.6) && d < dMin) {
          dMin = d; mejor = { k, hebra };
        }
      }
    }
    return mejor;
  }

  function unir(k) {
    conexiones[k] = true;
    flashes[k] = ahora;
    drag = null;
    hud.classList.remove('is-ok');
    void hud.offsetWidth;               // reinicia la animación del HUD
    hud.classList.add('is-ok');
    actualizarHud();
    if (unidas() === L.N) empezarFinal();
  }

  function soltarMal() {
    const p = punto(drag.k, drag.hebra);
    retraccion = { k: drag.k, hebra: drag.hebra, x: ptr.x, y: ptr.y, t: ahora };
    drag = null;
    return p;
  }

  canvas.addEventListener('pointerdown', e => {
    if (estado !== 'jugando') return;
    const { x, y } = pos(e);
    ptr.x = x; ptr.y = y; ptr.dx = x; ptr.dy = y;
    const p = puntoEn(x, y);

    // Modo "clic y clic": ya había un punto cogido
    if (drag) {
      if (p && p.k === drag.k && p.hebra !== drag.hebra) unir(p.k);
      else if (p) drag = { ...p, movido: false };
      else soltarMal();
      return;
    }
    if (p) {
      drag = { ...p, movido: false };
      canvas.setPointerCapture(e.pointerId);
    }
  });

  canvas.addEventListener('pointermove', e => {
    const { x, y } = pos(e);
    ptr.x = x; ptr.y = y;
    if (drag && Math.hypot(x - ptr.dx, y - ptr.dy) > 6) drag.movido = true;
    hover = estado === 'jugando' ? puntoEn(x, y) : null;
    canvas.style.cursor = drag ? 'grabbing' : hover ? 'grab' : 'crosshair';
  });

  canvas.addEventListener('pointerup', e => {
    if (!drag) return;
    const { x, y } = pos(e);
    const p = puntoEn(x, y);
    if (p && p.k === drag.k && p.hebra !== drag.hebra) unir(p.k);
    else if (drag.movido) soltarMal();
    // Si no se movió: se queda "cogido" y se une con el siguiente clic
  });

  canvas.addEventListener('pointercancel', () => { if (drag) soltarMal(); });

  /* ==========================================================================
     6. ANIMACIÓN FINAL
     · PULSO: una corriente amarilla recorre la hélice peldaño a peldaño
       (el conectoma es una red eléctrica).
     · GLITCH: la hélice se "digitaliza": se corta en tiras que se copian
       por toda la pantalla (como en el prototipo).
     · FINAL: la copia digital queda en ejecución: una hélice infinita que
       gira y avanza, con cortes glitch de vez en cuando, y aparece la DATA.
     ========================================================================== */
  function empezarFinal() {
    estado = 'pulso';
    tEstado = ahora;
    hud.textContent = 'Sinapsis completas · transmitiendo impulso eléctrico…';
    hint.classList.add('is-hidden');
  }

  function cambiarA(nuevo) {
    estado = nuevo;
    tEstado = ahora;
    if (nuevo === 'glitch') {
      hud.textContent = 'Digitalizando conectoma…';
      setTimeout(() => { if (estado !== 'jugando') mostrarData(); }, 600);
    }
    if (nuevo === 'final') {
      hud.textContent = 'Conectoma reconstruido · copia digital en ejecución';
      btnReset.classList.add('is-visible');
    }
  }

  let animContador = 0;
  function mostrarData() {
    panel.classList.add('is-visible');
    const t0 = performance.now();
    cancelAnimationFrame(animContador);
    const paso = t => {
      const u = clamp((t - t0) / 2400, 0, 1);
      const e = 1 - Math.pow(1 - u, 3);
      contador.textContent = Math.round(AJUSTES.neuronas * e).toLocaleString('es-ES');
      if (u < 1) animContador = requestAnimationFrame(paso);
    };
    animContador = requestAnimationFrame(paso);
  }

  function reiniciar() {
    estado = 'jugando';
    conexiones = conexiones.map(() => false);
    flashes = flashes.map(() => -10);
    scroll = 0;
    drag = null;
    panel.classList.remove('is-visible');
    btnReset.classList.remove('is-visible');
    cancelAnimationFrame(animContador);
    contador.textContent = '0';
    actualizarHud();
  }
  btnReset.addEventListener('click', reiniciar);

  /* ==========================================================================
     7. DIBUJO
     ========================================================================== */
  const mezcla = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function dibujarPunto(g, p, escala = 1, brillo = 0, alfa = 1) {
    const s = p.r * 2.6 * escala;
    g.globalAlpha = p.a * alfa;
    g.drawImage(spriteAzul, p.x - s / 2, p.y - s / 2, s, s);
    if (brillo > 0.01) {
      g.globalAlpha = brillo * alfa;
      g.drawImage(spriteAmarillo, p.x - s / 2, p.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
  }

  function dibujarPeldano(g, a, b, color, alfa = 1) {
    const ancho = L.R * 0.42 * (0.7 + 0.3 * ((a.z + b.z) / 2 + 1) / 2);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.strokeStyle = rgba(color, 0.18 * alfa);         // halo
    g.lineWidth = ancho * 3.2;
    g.stroke();
    g.strokeStyle = rgba(color, 0.9 * alfa);          // varilla
    g.lineWidth = ancho;
    g.stroke();
  }

  // Anillo amarillo que late (pista de cuál es la pareja)
  function anillo(g, p, t) {
    const u = (t * 1.6) % 1;
    g.beginPath();
    g.arc(p.x, p.y, p.r * (1.2 + u * 1.4), 0, Math.PI * 2);
    g.strokeStyle = rgba(AMARILLO, 0.9 * (1 - u));
    g.lineWidth = 1.2;
    g.stroke();
  }

  function dibujarEscena(g, t) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // ¿Qué peldaños se dibujan?
    let kMin = 0, kMax = L.N - 1;
    if (estado === 'glitch' || estado === 'final') {
      // Se amplía a toda la pantalla: la hélice se vuelve infinita
      const visMin = Math.floor((scroll - L.x0 - 2 * L.sep) / L.sep);
      const visMax = Math.ceil((W + scroll - L.x0 + L.sep) / L.sep);
      kMin = estado === 'final' ? visMin : Math.min(0, visMin);
      kMax = estado === 'final' ? visMax : Math.max(L.N - 1, visMax);
    }

    // Intensidad del pulso eléctrico en cada peldaño
    let kPulso = -99;
    if (estado === 'pulso') {
      const u = (t - tEstado) / AJUSTES.durPulso;
      kPulso = -1.5 + u * (L.N + 2);
    }

    // Aparición de los peldaños nuevos durante el glitch
    const alfaDe = k => {
      if (k >= 0 && k < L.N) return 1;
      if (estado === 'final') return 1;
      const dist = k < 0 ? -k : k - L.N + 1;
      return clamp(((t - tEstado) - dist * 0.05) / 0.25, 0, 1);
    };

    const puntos = [];
    for (let k = kMin; k <= kMax; k++) {
      const alfa = alfaDe(k);
      if (alfa <= 0) continue;
      const a = punto(k, 'A');
      const b = punto(k, 'B');
      const enJuego = k >= 0 && k < L.N;
      const unido = !enJuego || conexiones[k];
      const pulso = Math.exp(-Math.pow(k - kPulso, 2) / 0.9);
      const flash = enJuego ? clamp(1 - (t - flashes[k]) / 0.7, 0, 1) : 0;
      const calor = Math.max(pulso, flash);

      if (unido) dibujarPeldano(g, a, b, mezcla(AZUL, AMARILLO, calor), alfa);

      // Ondas que salen de los puntos al unirse
      if (flash > 0) {
        for (const p of [a, b]) {
          g.beginPath();
          g.arc(p.x, p.y, p.r * (1 + (1 - flash) * 2.5), 0, Math.PI * 2);
          g.strokeStyle = rgba(AMARILLO, flash);
          g.lineWidth = 1.2;
          g.stroke();
        }
      }
      puntos.push({ p: a, calor, alfa, k, hebra: 'A' }, { p: b, calor, alfa, k, hebra: 'B' });
    }

    // Puntos ordenados por profundidad (los de delante encima)
    puntos.sort((m, n) => m.p.z - n.p.z);
    for (const { p, calor, alfa } of puntos) {
      dibujarPunto(g, p, 1 + calor * 0.35, calor, alfa);
    }

    // Chispa que viaja por las hebras durante el pulso
    if (estado === 'pulso' && kPulso > -1 && kPulso < L.N) {
      const k0 = Math.floor(kPulso), f = kPulso - k0;
      for (const hebra of ['A', 'B']) {
        const p0 = punto(k0, hebra), p1 = punto(k0 + 1, hebra);
        const p = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, r: L.R * 0.8, a: 1 };
        g.globalCompositeOperation = 'lighter';
        dibujarPunto(g, p, 1.6, 1, 1);
        g.globalCompositeOperation = 'source-over';
      }
    }

    if (estado !== 'jugando') return;

    // Pareja del punto cogido (o bajo el cursor): anillo amarillo
    const sel = drag || hover;
    if (sel) {
      anillo(g, punto(sel.k, sel.hebra === 'A' ? 'B' : 'A'), t);
    }

    // Línea que sale del punto cogido hasta el cursor
    if (drag) {
      const a = punto(drag.k, drag.hebra);
      dibujarPeldano(g, a, { x: ptr.x, y: ptr.y, z: a.z }, mezcla(AZUL, AMARILLO, 0.25));
      dibujarPunto(g, { x: ptr.x, y: ptr.y, r: L.R * 0.45, a: 1 }, 1, 1);
    }

    // Línea que vuelve a su punto si se suelta en el sitio equivocado
    if (retraccion) {
      const u = clamp((t - retraccion.t) / 0.25, 0, 1);
      if (u >= 1) retraccion = null;
      else if (!conexiones[retraccion.k]) {
        const a = punto(retraccion.k, retraccion.hebra);
        const e = 1 - Math.pow(1 - u, 3);
        const x = retraccion.x + (a.x - retraccion.x) * e;
        const y = retraccion.y + (a.y - retraccion.y) * e;
        dibujarPeldano(g, a, { x, y, z: a.z }, AZUL, 1 - u);
      }
    }
  }

  /* ---------- Glitch: copia el buffer al canvas visible en tiras ---------- */
  let tiras = [], tTiras = 0;

  function nuevasTiras(fuerza) {
    tiras = [];
    let x = 0;
    while (x < W) {
      const w = Math.min(W - x, 14 + Math.random() * 150);
      const copia = Math.random() < 0.65;
      tiras.push({
        x, w,
        // De dónde se copia: a veces de otro trozo de la pantalla (se duplica)
        sx: copia ? x + (Math.random() * 2 - 1) * W * 0.22 * fuerza : x,
        dy: (Math.random() * 2 - 1) * 26 * fuerza,
      });
      x += w;
    }
  }

  function componer(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let fuerza = 0;
    if (estado === 'glitch') {
      const u = (t - tEstado) / AJUSTES.durGlitch;
      fuerza = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;    // fuerte y luego se calma
    } else if (estado === 'final') {
      // Cortes cortos cada pocos segundos
      const ciclo = (t - tEstado) % 3.4;
      if (ciclo > 3.0) fuerza = 0.45;
    }
    if (reduceMotion) fuerza = 0;

    if (fuerza <= 0.02) {
      ctx.drawImage(buf, 0, 0);
    } else {
      dibujarTiras(t, fuerza);
    }

    // Al final la hélice ocupa toda la pantalla: se oscurece por la izquierda
    // para que el texto y la DATA se sigan leyendo (solo escritorio)
    if (!L.movil && (estado === 'glitch' || estado === 'final')) {
      const fin = L.texDer + 120;
      const u = estado === 'final' ? 1 : clamp((t - tEstado) / 0.6, 0, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gr = ctx.createLinearGradient(0, 0, fin, 0);
      gr.addColorStop(0, `rgba(0,0,0,${0.9 * u})`);
      gr.addColorStop((L.texDer + 10) / fin, `rgba(0,0,0,${0.85 * u})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, fin, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function dibujarTiras(t, fuerza) {

    if (t - tTiras > 0.08) {           // las tiras cambian a saltos (estética retro)
      nuevasTiras(fuerza);
      tTiras = t;
    }
    const Wp = buf.width;
    for (const s of tiras) {
      let sx = ((s.sx % W) + W) % W;
      const w = Math.min(s.w, W - sx);   // que no se salga del buffer
      ctx.drawImage(buf, sx * dpr, 0, w * dpr, buf.height, s.x * dpr, s.dy * dpr, w * dpr, buf.height);
    }
    // Copia fantasma desplazada (aberración, muy sutil)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 * fuerza;
    ctx.drawImage(buf, 6 * dpr * fuerza, 0, Wp, buf.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ==========================================================================
     8. BUCLE
     ========================================================================== */
  let tAnterior = performance.now() / 1000;

  function bucle(ms) {
    ahora = ms / 1000;
    const dt = Math.min(ahora - tAnterior, 0.05);
    tAnterior = ahora;

    if (estado === 'jugando' || estado === 'pulso') {
      // Respiración suave: la hélice se mueve un poco, sin estorbar al arrastrar
      giro = reduceMotion ? 0 : 0.18 * Math.sin(ahora * 0.5);
    }
    if (estado === 'pulso' && ahora - tEstado > AJUSTES.durPulso) cambiarA('glitch');

    if (estado === 'glitch' || estado === 'final') {
      // La hélice empieza a girar y a avanzar (cada vez más rápido)
      const u = estado === 'final' ? 1 : clamp((ahora - tEstado) / AJUSTES.durGlitch, 0, 1);
      if (!reduceMotion) {
        giro += dt * 0.7 * u;
        scroll += dt * AJUSTES.velFinal * u;
      }
    }
    if (estado === 'glitch' && ahora - tEstado > AJUSTES.durGlitch) cambiarA('final');

    dibujarEscena(bctx, ahora);
    componer(ahora);
    requestAnimationFrame(bucle);
  }

  window.addEventListener('resize', medir);
  // Espera a la fuente para medir bien el bloque de texto
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(medir);
  medir();
  requestAnimationFrame(bucle);
})();
