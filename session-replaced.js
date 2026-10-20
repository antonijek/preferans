// "Igraš na drugom uređaju" (po uzoru na Loru, 2026-10-20): server prekida
// stariju vezu istog naloga (server/src/socket/index.ts). Ovde se tada
// prikaze prozor sa "Igraj ovde" — bez toga bi stari tab cutao sa
// zastarelim stolom. Obican prekid (los signal, restart servera) socket.io
// sam ponovo poveze; ovo vazi samo kad je SERVER prekinuo vezu.

import { askConfirm } from './dialog.js';

export function watchSessionReplaced(socket, reconnect) {
  let replaced = false;
  socket.on('session:replaced', () => { replaced = true; });
  socket.on('disconnect', async (reason) => {
    if (reason !== 'io server disconnect') return;
    await askConfirm({
      title: replaced ? 'Igraš na drugom uređaju' : 'Veza je prekinuta',
      text: replaced
        ? 'Preferans je otvoren na drugom telefonu, računaru ili kartici, pa je ovde zaustavljen. Ako želiš da igraš ovde, klikni „Igraj ovde“ — tada se zaustavlja na drugom uređaju.'
        : 'Server je prekinuo vezu. Klikni da se ponovo povežeš.',
      ok: replaced ? 'Igraj ovde' : 'Poveži se ponovo',
      cancel: null,
      escapable: false,
    });
    reconnect();
  });
}
