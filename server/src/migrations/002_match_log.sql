-- Istorija zavrsenih partija (korisnikov zahtev 2026-09-11).
-- ~5 KB po partiji, za 50 korisnika x 3 partije/dan = ~750 KB/dan, zanemarivo.
CREATE TABLE match_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_code TEXT NOT NULL,
  ended_at TEXT NOT NULL DEFAULT (datetime('now')),
  match_end_reason TEXT NOT NULL,
  rounds_played INTEGER NOT NULL,
  player0_user_id INTEGER REFERENCES users(id),
  player1_user_id INTEGER REFERENCES users(id),
  player2_user_id INTEGER REFERENCES users(id),
  player0_name TEXT,
  player1_name TEXT,
  player2_name TEXT,
  final_bulas TEXT NOT NULL,
  final_scores TEXT NOT NULL,
  rating_deltas TEXT NOT NULL,
  new_ratings TEXT NOT NULL,
  -- NIZ rundi (po jedan JSON objekat po ruci) — dovoljan za replay analizu
  -- sporne partije. Svaka runda: bidding, plays, tricks, lastHandResult,
  -- final_bulas_posle_runde, deal/talon, deklaracija/kontra, itd.
  -- Za 50 korisnika × 3 partije × 6 rundi = ~900 rundi/dan × ~10 KB
  -- = ~9 MB/dan, prihvatljivo.
  hands_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX idx_match_log_player0 ON match_log(player0_user_id);
CREATE INDEX idx_match_log_player1 ON match_log(player1_user_id);
CREATE INDEX idx_match_log_player2 ON match_log(player2_user_id);
CREATE INDEX idx_match_log_ended_at ON match_log(ended_at DESC);
