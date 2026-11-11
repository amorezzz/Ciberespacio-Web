/* =========================================================
   HINT.JS — la pastilla azul de indicación (.hint) desaparece
   tras la PRIMERA interacción del usuario. Se usa en todas las páginas.

   Se configura desde el HTML con atributos en la propia pastilla:
     data-ocultar-con="pointerdown keydown"  → eventos que la ocultan
                                               (por defecto: pointerdown)
     data-en="#scene"                        → dónde se escuchan
                                               (por defecto: toda la página)
     data-teclas="ArrowLeft ArrowRight"      → con keydown, solo estas teclas

   Cualquier otro script también puede ocultarla con:
     document.dispatchEvent(new Event('hint:ocultar'));
   ========================================================= */
(() => {
  'use strict';

  document.querySelectorAll('.hint').forEach(hint => {
    const eventos = (hint.dataset.ocultarCon || 'pointerdown').split(' ');
    const zona = (hint.dataset.en && document.querySelector(hint.dataset.en)) || document;
    const teclas = hint.dataset.teclas ? hint.dataset.teclas.split(' ') : null;

    function ocultar(e) {
      // Con teclado, solo cuentan las teclas indicadas
      if (e && e.type === 'keydown' && teclas && !teclas.includes(e.key)) return;
      hint.classList.add('is-hidden');
      eventos.forEach(ev => zona.removeEventListener(ev, ocultar));
      document.removeEventListener('hint:ocultar', ocultar);
    }

    eventos.forEach(ev => zona.addEventListener(ev, ocultar));
    document.addEventListener('hint:ocultar', ocultar);
  });
})();
