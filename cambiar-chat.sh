#!/usr/bin/env bash
# Cambia a quién le llegan los avisos de Telegram y reinicia el bot.
# Uso:  bash /opt/bot/cambiar-chat.sh veronica 123456789
#       bash /opt/bot/cambiar-chat.sh dueno 123456789
set -euo pipefail
quien=${1:-}; numero=${2:-}
case "$quien" in
  veronica) clave=TELEGRAM_CHAT_ID ;;
  dueno) clave=TELEGRAM_CHAT_SUPERVISOR ;;
  *) echo "Uso: bash /opt/bot/cambiar-chat.sh veronica|dueno NUMERO"; exit 1 ;;
esac
[[ "$numero" =~ ^-?[0-9]+$ ]] || { echo "El número de chat debe tener solo dígitos."; exit 1; }
sed -i "s/^${clave}=.*/${clave}=${numero}/" /opt/bot/.env
systemctl restart bot
echo "Listo: los avisos de ${quien} van al chat ${numero}."
