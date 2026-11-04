#!/usr/bin/env bash
# Baja la última versión del bot, corre las pruebas y lo reinicia. Uso: bash /opt/bot/actualizar.sh
set -euo pipefail
cd /opt/bot
git config --global --add safe.directory /opt/bot
git pull -q
node --test test/*.test.js >/tmp/pruebas.txt 2>&1 || { echo "Fallaron las pruebas; no se reinició:"; tail -20 /tmp/pruebas.txt; exit 1; }
chown -R bot:bot /opt/bot
systemctl restart bot
echo "Bot actualizado y reiniciado."
