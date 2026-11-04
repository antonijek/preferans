// Dugme „Nastavi partiju sa računarom“ na početnoj (korisnik 2026-11-03): partija sa računarom se čuva kad igrač
// pređe za drugi sto, npr. na poziv (server/src/socket/botPause.ts). Server kaže da li je ima i na kojoj je buli.
let deps = { getSocket: () => null, onResume: () => {} };

export function initPausedBotUi(options) {
  deps = options;
}

export function refreshPausedBot() {
  const btn = document.getElementById('resumeBotBtn');
  const socket = deps.getSocket();
  if (!socket) {
    btn.style.display = 'none';
    return;
  }
  socket.emit('room:paused-bot', {}, (res) => {
    if (!res?.code) {
      btn.style.display = 'none';
      return;
    }
    btn.textContent = `▶ Nastavi partiju sa računarom (bula ${res.bula})`;
    btn.onclick = () => deps.onResume(res.code);
    btn.style.display = '';
  });
}
