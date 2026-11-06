// Oko u polju za lozinku: pokaže ili sakrije ukucano (korisnik, 6.11.2026).
// Isti fajl postoji u Lori i Preferansu. Svako polje type="password" na stranici dobija dugme;
// boje nisu potrebne (currentColor), pa radi uz temu svake stranice. !important je namerno: stranice
// imaju opšta pravila za dugmad (npr. #login button { width: 100% }) koja bi pomerila oko.
(function () {
  const STYLE = `
.pw-wrap { position: relative; display: block; }
.pw-wrap > input { width: 100%; box-sizing: border-box; padding-right: 44px; }
.pw-wrap > .pw-eye { position: absolute !important; top: 50% !important; right: 4px !important;
  left: auto !important; transform: translateY(-50%); display: grid; place-items: center;
  width: 36px !important; height: 36px !important; min-width: 0 !important; margin: 0 !important;
  padding: 0 !important; border: 0 !important; border-radius: 8px; background: none !important;
  box-shadow: none !important; color: inherit; opacity: .7; cursor: pointer; }
.pw-wrap > .pw-eye:hover, .pw-wrap > .pw-eye:focus-visible { opacity: 1; }
.pw-eye svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8;
  stroke-linecap: round; stroke-linejoin: round; }
.pw-eye .pw-slash { display: none; }
.pw-eye[aria-pressed="true"] .pw-slash { display: inline; }
`;
  const ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>' +
    '<circle cx="12" cy="12" r="3"/><path class="pw-slash" d="M4 4l16 16"/></svg>';

  function addEye(input) {
    if (input.dataset.pwEye) return;
    input.dataset.pwEye = '1';
    // Razmak oko polja prelazi na omotač, da oko stoji tačno na sredini polja.
    const css = getComputedStyle(input);
    const wrap = document.createElement('span');
    wrap.className = 'pw-wrap';
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) wrap.style['margin' + side] = css['margin' + side];
    input.style.margin = '0';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pw-eye';
    button.innerHTML = ICON;
    const sync = () => {
      const shown = input.type === 'text';
      const label = shown ? 'Sakrij lozinku' : 'Prikaži lozinku';
      button.setAttribute('aria-pressed', String(shown));
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    button.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      sync();
      input.focus();
    });
    // Posle slanja forme lozinka se opet sakrije, da ne ostane vidljiva sledeći put.
    if (input.form) {
      input.form.addEventListener('submit', () => {
        input.type = 'password';
        sync();
      });
    }
    sync();
    wrap.appendChild(button);
  }

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  document.querySelectorAll('input[type="password"]').forEach(addEye);
})();
