#!/bin/sh
# Canonical deploy script — the ONLY command that should ever be used to
# ship this repo to production.
#
# Uzivo prijavljen bag KROZ AUDIT (2026-09-26, pred lansiranje): server/
# uvozi KOMPAJLIRANI JS direktno iz engine/dist/ (ne preko npm paketa), a
# engine/dist/ je gitignored. `git pull` na VPS-u NIKAD sam od sebe ne
# osvezava engine/dist/ — ako se deploy ikad izvede BEZ `cd engine && npm
# run build` PRE `cd server && npm run build`, server tiho nastavi da radi
# na STAROM engine kodu iako git istorija izgleda azurno. Ovaj skript
# postoji da ta greska vise nikad ne bude moguca — koristi OVO, ne
# rucno-otkucanu SSH komandu.
set -e

VPS_HOST="root@213.199.32.240"
REMOTE_DIR="/var/www/preferans"

echo "==> Deploying to $VPS_HOST:$REMOTE_DIR"
ssh -o ConnectTimeout=10 "$VPS_HOST" "
  set -e
  cd $REMOTE_DIR
  git pull
  cd engine && npm run build
  cd ../server && npm run build
  pm2 restart pref-server
  sleep 1
  pm2 logs pref-server --lines 15 --nostream
"
echo "==> Deploy done."
