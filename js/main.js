(() => {
  'use strict';

  /* ==========================================================================
     1. AJUSTES DEL ASPECTO (cámbialos aquí para acercarte a Blender)
     ========================================================================== */
  // Intensidad de la emisión. En Blender es ~27, pero en la web eso quema los
  // colores hacia blanco. Entre 1 y 3 se mantiene el color y el bloom pone el brillo.
  const EMISSIVE_STRENGTH = 2;
  // Color base (difuso) de los materiales. Negro = solo se ve la luz emitida,
  // sin el "velo" gris que añade la iluminación de la escena.
  const BASE_COLOR = [0, 0, 0, 1];

  /* ==========================================================================
     2. UI Y MENÚ
     ========================================================================== */
  const viewer = document.getElementById('scene');
  const caption = document.getElementById('caption');
  const infoBtn = document.getElementById('infoBtn');
  const infoPanel = document.getElementById('infoPanel');
  const links = [...document.querySelectorAll('.nav__item')];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const infoClose = document.getElementById('infoClose');

  // Abre/cierra el overlay de INFO. La animación la hace el CSS con la clase
  // "is-open" en el propio overlay.
  function toggleInfo(open) {
    infoPanel.classList.toggle('is-open', open);
    infoBtn.setAttribute('aria-expanded', String(open));
    if (open) infoPanel.focus({ preventScroll: true });
  }
  const isInfoOpen = () => infoPanel.classList.contains('is-open');

  infoBtn.addEventListener('click', () => toggleInfo(!isInfoOpen()));
  infoClose.addEventListener('click', () => { toggleInfo(false); infoBtn.focus(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && isInfoOpen()) toggleInfo(false); });

  if (reduceMotion) viewer.removeAttribute('auto-rotate');

  /* ==========================================================================
     3. MATERIALES: colores originales sin blanquear
     ========================================================================== */
  // Se aplica a TODOS los visores 3D de la página (globo y suelo del overlay)
  document.querySelectorAll('model-viewer').forEach(mv => {
    mv.addEventListener('load', () => {
      mv.model.materials.forEach(mat => {
        mat.pbrMetallicRoughness.setBaseColorFactor(BASE_COLOR);
        mat.pbrMetallicRoughness.setMetallicFactor(0);
        mat.pbrMetallicRoughness.setRoughnessFactor(1);

        /* El azul necesita más intensidad para superar el umbral del bloom porque su color
          naturalmente tiene poca luminación.
          Esta const dice que el elemento que tengo con el material.002 (el material azul)
          vale 2,2 veces más [2.2 : 1].*/
        const extra = mat.name === 'Material.002' ? 2.2 : 1;
        mat.setEmissiveStrength(EMISSIVE_STRENGTH * extra);
      });
    });
    mv.addEventListener('error', e => console.error('Error al cargar el archivo .glb:', e.detail));
  });

  /* ==========================================================================
     4. PUNTOS CLICABLES (hotspots sobre cada punto amarillo)
     ========================================================================== */
  let hovered = null;

  function setHover(link) {
    if (link === hovered) return;
    hovered = link;
    links.forEach(l => l.classList.toggle('is-active', l === link));
    viewer.querySelectorAll('.hotspot').forEach(h => h.classList.toggle('is-active', !!link && h.dataset.id === link.dataset.id));
    caption.textContent = link ? link.dataset.title : caption.dataset.default;
    // El globo se para mientras se señala un punto
    if (!reduceMotion) viewer.autoRotate = !link;
  }

  links.forEach(link => {
    const pos = link.dataset.pos;
    if (!pos) return;
    const [x, y, z] = pos.split(' ').map(Number);
    const len = Math.hypot(x, y, z) || 1;

    const spot = document.createElement('button');
    spot.className = 'hotspot';
    spot.type = 'button';
    spot.slot = `hotspot-${link.dataset.id}`;
    spot.dataset.id = link.dataset.id;
    spot.dataset.position = `${x}m ${y}m ${z}m`;
    // La normal apunta hacia fuera del globo: el punto se oculta cuando queda detrás
    spot.dataset.normal = `${x / len}m ${y / len}m ${z / len}m`;
    spot.dataset.visibilityAttribute = 'visible';
    spot.setAttribute('aria-label', link.dataset.title);

    spot.addEventListener('click', () => { location.href = link.href; });
    spot.addEventListener('mouseenter', () => setHover(link));
    spot.addEventListener('mouseleave', () => setHover(null));
    spot.addEventListener('focus', () => setHover(link));
    spot.addEventListener('blur', () => setHover(null));
    viewer.appendChild(spot);

    ['mouseenter', 'focus'].forEach(ev => link.addEventListener(ev, () => setHover(link)));
    ['mouseleave', 'blur'].forEach(ev => link.addEventListener(ev, () => setHover(null)));
  });

  /* ==========================================================================
     5. CONTADOR: tiempo que el usuario ha pasado en el ciberespacio
     Formato DD:HH:MM:SS (días:horas:minutos:segundos).
     Se guarda en el navegador (localStorage), así que el tiempo se acumula
     aunque el usuario cierre la página y vuelva otro día.
     ========================================================================== */
  const timerEl = document.getElementById('tiempo');
  const STORAGE_KEY = 'ciberespacio-tiempo';

  if (timerEl) {
    // Segundos acumulados en visitas anteriores (0 si es la primera vez)
    let saved = 0;
    try { saved = Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (e) {}
    const start = Date.now();

    const pad = n => String(n).padStart(2, '0');

    const totalSeconds = () => saved + Math.floor((Date.now() - start) / 1000);

    function tick() {
      const t = totalSeconds();
      const d = Math.floor(t / 86400);
      const h = Math.floor(t / 3600) % 24;
      const m = Math.floor(t / 60) % 60;
      const s = t % 60;
      timerEl.textContent = `${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`;
      try { localStorage.setItem(STORAGE_KEY, String(t)); } catch (e) {}
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ==========================================================================
     6. SUBJECT Nº: número de visitante de la web (contador global)
     El total se guarda en un servicio gratuito online (Abacus), porque una
     web estática no tiene servidor propio donde guardarlo.
     Cada navegador recibe UN número la primera vez que entra y lo conserva
     (localStorage): al recargar sigue siendo el mismo "subject".
     ========================================================================== */
  const subjectEl = document.getElementById('subject');
  const SUBJECT_KEY = 'ciberespacio-subject';
  // URL del contador: /hit/ suma 1 y devuelve el total → {"value": 128}
  const COUNTER_URL = 'https://abacus.jasoncameron.dev/hit/neuromante-ciberespacio-web/visitas';
  const DIGITS = 3; // cifras mínimas: 7 → "007"

  if (subjectEl) {
    const show = n => { subjectEl.textContent = String(n).padStart(DIGITS, '0'); };

    let mine = null;
    try { mine = localStorage.getItem(SUBJECT_KEY); } catch (e) {}

    if (mine) {
      show(mine); // ya tenía número: no se vuelve a contar
    } else {
      fetch(COUNTER_URL)
        .then(r => r.json())
        .then(data => {
          show(data.value);
          try { localStorage.setItem(SUBJECT_KEY, String(data.value)); } catch (e) {}
        })
        .catch(() => { subjectEl.textContent = '???'; }); // sin conexión
    }
  }
})();
