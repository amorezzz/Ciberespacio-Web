(() => {
  'use strict';

  /* ==========================================================================
     AJUSTES
     ========================================================================== */
  const PAUSA_MS = 450;       // tiempo que el ratón tiene que estar quieto para mostrar DATA
  const RADIO_PUNTO = 110;    // px: lo cerca que hay que parar de un punto para activarlo
  const SUAVIDAD = 0.16;      // 0–1: lo rápido que la luz sigue al ratón (1 = sin retraso)
  const SEPARACION = 34;      // px entre el punto y su panel de DATA

  const bio = document.getElementById('bio');
  const luz = document.getElementById('bioLuz');
  const img = luz.querySelector('img');
  const paneles = [...document.querySelectorAll('.bio-data')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==========================================================================
     1. PUNTOS: posición de cada DATA sobre la imagen → posición en pantalla
     La imagen usa object-fit: cover (se recorta), así que hay que calcular
     dónde cae cada punto de la imagen en la pantalla.
     ========================================================================== */
  const puntos = paneles.map(panel => {
    const marca = document.createElement('span');
    marca.className = 'bio-marca';
    marca.innerHTML = '<i></i>';
    // Fuera de la capa de luz (que tiene máscara), para que la cruz se vea siempre
    bio.appendChild(marca);
    return {
      panel,
      marca,
      fx: Number(panel.dataset.x),   // 0–1 sobre la imagen
      fy: Number(panel.dataset.y),
      x: 0, y: 0                     // px en pantalla (se calcula abajo)
    };
  });

  function colocarPuntos() {
    const W = bio.clientWidth;
    const H = bio.clientHeight;
    const iw = img.naturalWidth || W;
    const ih = img.naturalHeight || H;
    // Escala de "cover": la imagen llena la stage y se recorta lo que sobra
    const s = Math.max(W / iw, H / ih);
    const offX = (W - iw * s) / 2;
    const offY = (H - ih * s) / 2;

    puntos.forEach(p => {
      p.x = offX + p.fx * iw * s;
      p.y = offY + p.fy * ih * s;
      p.marca.style.left = `${p.x}px`;
      p.marca.style.top = `${p.y}px`;
    });
    if (activo) colocarPanel(activo);
  }

  // Coloca el panel al lado del punto, sin salirse de la pantalla
  function colocarPanel(p) {
    const W = bio.clientWidth;
    const H = bio.clientHeight;
    const pw = p.panel.offsetWidth;
    const ph = p.panel.offsetHeight;
    // A la derecha del punto; si no cabe, a la izquierda
    let left = p.x + SEPARACION;
    if (left + pw > W - 14) left = p.x - SEPARACION - pw;
    let top = p.y - ph / 2;
    top = Math.min(Math.max(top, 14), H - ph - 14);
    p.panel.style.left = `${Math.max(14, left)}px`;
    p.panel.style.top = `${top}px`;
  }

  /* ==========================================================================
     2. LUZ QUE SIGUE AL RATÓN
     ========================================================================== */
  const raton = { x: -999, y: -999 };     // dónde está el ratón
  const foco = { x: -999, y: -999, r: 0 }; // dónde está la luz (va un poco por detrás)
  let radioObjetivo = 0;
  let primeraVez = true;

  function radioLuz() {
    return parseFloat(getComputedStyle(bio).getPropertyValue('--luz-r')) || 240;
  }

  function animar() {
    const k = reduceMotion ? 1 : SUAVIDAD;
    foco.x += (raton.x - foco.x) * k;
    foco.y += (raton.y - foco.y) * k;
    foco.r += (radioObjetivo - foco.r) * (reduceMotion ? 1 : 0.08);
    luz.style.setProperty('--mx', `${foco.x}px`);
    luz.style.setProperty('--my', `${foco.y}px`);
    luz.style.setProperty('--r', `${foco.r}px`);
    requestAnimationFrame(animar);
  }

  /* ==========================================================================
     3. DATA: aparece cuando el ratón PARA cerca de un punto
     ========================================================================== */
  let activo = null;
  let temporizador = null;

  function puntoCercano(x, y) {
    let mejor = null;
    let dMin = RADIO_PUNTO;
    puntos.forEach(p => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < dMin) { dMin = d; mejor = p; }
    });
    return mejor;
  }

  function mostrar(p) {
    if (p === activo) return;
    ocultar();
    activo = p;
    colocarPanel(p);
    p.panel.classList.add('is-visible');
    document.dispatchEvent(new Event('hint:ocultar')); // primera interacción
    p.marca.classList.add('is-active');
  }

  function ocultar() {
    if (!activo) return;
    activo.panel.classList.remove('is-visible');
    activo.marca.classList.remove('is-active');
    activo = null;
  }

  bio.addEventListener('pointermove', e => {
    const r = bio.getBoundingClientRect();
    raton.x = e.clientX - r.left;
    raton.y = e.clientY - r.top;
    radioObjetivo = radioLuz();

    // La primera vez la luz aparece directamente donde está el ratón
    if (primeraVez) { foco.x = raton.x; foco.y = raton.y; primeraVez = false; }

    // Si se aleja del punto activo, el panel desaparece
    if (activo && Math.hypot(activo.x - raton.x, activo.y - raton.y) > RADIO_PUNTO * 1.4) ocultar();

    // Cada movimiento reinicia la cuenta: solo cuenta cuando el ratón se queda quieto
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      const p = puntoCercano(raton.x, raton.y);
      if (p) mostrar(p);
    }, PAUSA_MS);
  });

  bio.addEventListener('pointerleave', () => {
    clearTimeout(temporizador);
    radioObjetivo = 0;   // la luz se apaga poco a poco
    ocultar();
  });

  /* ==========================================================================
     4. NÚMEROS EN VIVO: el contador de cada panel oscila dentro de su rango
     ========================================================================== */
  // Pone un punto cada 3 cifras: 7392118 → 7.392.118
  const formato = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  setInterval(() => {
    if (!activo) return;
    const el = activo.panel.querySelector('.contador');
    const min = Number(activo.panel.dataset.min);
    const max = Number(activo.panel.dataset.max);
    if (!el || isNaN(min) || isNaN(max)) return;
    el.textContent = formato(min + Math.random() * (max - min));
  }, 350);

  /* ==========================================================================
     ARRANQUE
     ========================================================================== */
  if (img.complete) colocarPuntos();
  img.addEventListener('load', colocarPuntos);
  img.addEventListener('error', () => console.error('No se encuentra la imagen de la red neuronal:', img.src));
  addEventListener('resize', colocarPuntos);
  requestAnimationFrame(animar);
})();
