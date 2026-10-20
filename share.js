// "Podeli rezultat" (po uzoru na Loru, 2026-10-20): slika rezultata partije
// 1080×1080 za Viber/WhatsApp/Facebook, sa adresom sajta — svaki podeljen
// rezultat je mala reklama. Na telefonu ide kroz sistemsko deljenje (slika +
// tekst); na racunaru se slika sacuva, a tekst kopira. Boje iz teme
// (:root u preferans.css), ne zakucane.

const W = 1080;
const H = 1080;
const FONT = '-apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const DECO = ['AS', 'AH', 'AD', 'AC'];
const SITE = 'preferans.igrajmo.online';

function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return { felt: v('--felt'), feltDark: v('--felt-dark'), wood: v('--wood'), gold: v('--gold'), goldBright: v('--gold-bright') };
}

function loadImg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null); // bez ukrasa ako karta ne stigne — slika i dalje valja
    im.src = src;
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Tekst skracen da stane u sirinu (dugacka imena). */
function fit(g, text, max) {
  let t = String(text);
  if (g.measureText(t).width <= max) return t;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** info: { title, sub, date, rows: [{ place, name, result, me }] } → PNG Blob */
async function drawImage(info) {
  const t = theme();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = t.wood;
  g.fillRect(0, 0, W, H);
  const felt = g.createRadialGradient(W / 2, H * 0.35, 60, W / 2, H * 0.45, W * 0.75);
  felt.addColorStop(0, t.felt);
  felt.addColorStop(1, t.feltDark);
  roundRect(g, 26, 26, W - 52, H - 52, 46);
  g.fillStyle = felt;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = t.gold;
  g.stroke();

  // cetiri keca u lepezi
  const cards = await Promise.all(DECO.map((id) => loadImg(`/icons/cards/${id}.svg`)));
  cards.forEach((im, i) => {
    if (!im) return;
    g.save();
    g.translate(W - 210, 250);
    g.rotate(((-24 + i * 16) * Math.PI) / 180);
    g.shadowColor = 'rgba(0,0,0,.45)';
    g.shadowBlur = 18;
    g.shadowOffsetY = 6;
    g.drawImage(im, -60, -190, 120, 168);
    g.restore();
  });

  g.textBaseline = 'alphabetic';
  g.fillStyle = t.goldBright;
  g.font = `800 64px Cinzel, ${FONT}`;
  g.fillText('Preferans', 80, 150);
  g.font = `500 30px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,.65)';
  g.fillText(info.date, 80, 200);

  g.fillStyle = 'white';
  g.font = `800 88px ${FONT}`;
  g.fillText(fit(g, info.title, W - 380), 80, 330);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.font = `600 38px ${FONT}`;
  g.fillText(fit(g, info.sub, W - 160), 80, 395);

  const rowH = 120;
  const top = 470;
  const medal = [t.goldBright, 'rgba(255,255,255,.75)', t.gold];
  info.rows.forEach((r, i) => {
    const y = top + i * rowH;
    roundRect(g, 70, y, W - 140, rowH - 18, 24);
    g.fillStyle = r.me ? `rgba(255,255,255,.16)` : 'rgba(0,0,0,.28)';
    g.fill();
    if (r.place === 1) { g.lineWidth = 4; g.strokeStyle = t.goldBright; g.stroke(); }
    const cy = y + (rowH - 18) / 2;
    g.beginPath();
    g.arc(135, cy, 32, 0, Math.PI * 2);
    g.fillStyle = medal[r.place - 1] ?? 'rgba(255,255,255,.18)';
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.85)';
    g.font = `800 34px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(r.place), 135, cy + 1);
    g.textAlign = 'left';
    g.font = `${r.me ? 800 : 600} 42px ${FONT}`;
    g.fillStyle = r.me ? t.goldBright : 'white';
    g.fillText(fit(g, r.name, W - 480), 195, cy + 1);
    g.textAlign = 'right';
    g.font = `800 48px ${FONT}`;
    g.fillStyle = 'white';
    g.fillText(r.result, W - 110, cy + 2);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  });

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.font = `500 30px ${FONT}`;
  g.fillText('Igraj preferans besplatno — sa prijateljima ili protiv računara', W / 2, H - 140);
  g.fillStyle = t.goldBright;
  g.font = `800 44px ${FONT}`;
  g.fillText(SITE, W / 2, H - 92);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

/**
 * Podeli rezultat. Vraca 'shared' | 'canceled' | 'saved' (slika sacuvana, tekst kopiran)
 * | 'saved-no-text' (slika sacuvana, ostava nedostupna). Greska u crtanju se baca dalje.
 */
export async function shareResult(info, text) {
  const blob = await drawImage(info);
  if (!blob) throw new Error('slika nije napravljena');
  const url = `https://${SITE}/`;
  const full = `${text}\n${url}`;
  const file = new File([blob], 'preferans-rezultat.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: full });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'canceled';
      // neki pregledaci odbiju sliku sa tekstom — probaj samo sliku
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e2) {
        return e2?.name === 'AbortError' ? 'canceled' : downloadAndCopy(blob, full);
      }
    }
  }
  return downloadAndCopy(blob, full);
}

async function downloadAndCopy(blob, full) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'preferans-rezultat.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try {
    await navigator.clipboard.writeText(full);
    return 'saved';
  } catch (e) {
    console.warn('[podeli] tekst nije kopiran:', e);
    return 'saved-no-text';
  }
}
