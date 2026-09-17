// === ZVUCNI EFEKTI ===
// Sve procedurulno generisano preko Web Audio API (osciloatori + kratke
// gain-envelope, plus filtrirani "noise burst" za sustanje karata) — bez
// spoljnih audio fajlova, radi offline, nema licenciranja. AudioContext se
// pravi/nastavlja tek na PRVI klik (browser autoplay politika), sto se
// prirodno desava jer je delegacija klika na dugmad ionako prvi trag
// korisnicke interakcije.
export const sfx = (() => {
  let ctx = null;
  let muted = localStorage.getItem('prefSoundMuted') === '1';
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, duration, { type = 'sine', gain = 0.12, delay = 0 } = {}) {
    if (muted) return;
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      g.gain.setValueAtTime(0, c.currentTime + delay);
      g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + duration);
      osc.connect(g).connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + duration + 0.03);
    } catch { /* AudioContext moze biti blokiran/nedostupan — tisina je bezbedan fallback */ }
  }
  function noiseBurst(duration, { gain = 0.09, delay = 0, filterFreq = 2200 } = {}) {
    if (muted) return;
    try {
      const c = getCtx();
      const size = Math.max(1, Math.floor(c.sampleRate * duration));
      const buffer = c.createBuffer(1, size, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, c.currentTime + delay);
      src.connect(filter).connect(g).connect(c.destination);
      src.start(c.currentTime + delay);
    } catch { /* isto kao gore */ }
  }
  return {
    click() { tone(680, 0.045, { type: 'square', gain: 0.05 }); },
    cardPlay() {
      noiseBurst(0.08, { gain: 0.11, filterFreq: 2600 });
      tone(280, 0.05, { type: 'triangle', gain: 0.05, delay: 0.01 });
    },
    deal() {
      // Naglaseniji zvuk (korisnikov zahtev — prethodna verzija se gubila u
      // brzim AI potezima, "ne cuje se zvuk deljenja za novu rundu"): dublji
      // ton na pocetku da najavi "nova ruka" pre same serije tickova, vise
      // tickova/glasnije/duze da ostane primetno i kad se odigra brzo.
      tone(180, 0.09, { type: 'sine', gain: 0.1 });
      for (let i = 0; i < 8; i++) {
        noiseBurst(0.045, { gain: 0.1, filterFreq: 3800, delay: 0.05 + i * 0.06 });
      }
    },
    talon() {
      tone(440, 0.12, { type: 'sine', gain: 0.08 });
      tone(660, 0.16, { type: 'sine', gain: 0.06, delay: 0.06 });
    },
    win() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'sine', gain: 0.07, delay: i * 0.09 }));
    },
    // Korisnikov zahtev (2026-09-07): poruke stizu (vide se kad se chat
    // otvori) ali NISTA ne obavesti da je nesto novo stiglo dok je chat
    // zatvoren — kratak, blag "pling" (razlicit od click/cardPlay) plus
    // vizuelna znacka (vidi appendChatMessageOnline).
    chatMessage() {
      tone(880, 0.05, { type: 'sine', gain: 0.06 });
      tone(1175, 0.07, { type: 'sine', gain: 0.05, delay: 0.05 });
    },
    toggleMuted() {
      muted = !muted;
      localStorage.setItem('prefSoundMuted', muted ? '1' : '0');
      return muted;
    },
    isMuted() { return muted; },
  };
})();
