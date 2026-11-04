#!/usr/bin/env bash
# Pone la clave de 360dialog en el bot y le dice a 360dialog a dónde mandar los mensajes.
# Uso (como root en el servidor):  bash /opt/bot/conectar-360.sh
set -euo pipefail
ENV=/opt/bot/.env
DOMINIO=panel.editoraortega.com

read -rsp "Pegue la clave de API de 360dialog (no se ve al escribir) y presione Enter: " CLAVE </dev/tty; echo
[ -n "$CLAVE" ] || { echo "No escribió ninguna clave."; exit 1; }

if grep -q '^D360_API_KEY=' "$ENV"; then sed -i "s|^D360_API_KEY=.*|D360_API_KEY=${CLAVE}|" "$ENV"; else echo "D360_API_KEY=${CLAVE}" >> "$ENV"; fi
SECRETO=$(grep '^WEBHOOK_SECRETO=' "$ENV" | cut -d= -f2-)
URL="https://${DOMINIO}/webhook/whatsapp/${SECRETO}"
systemctl restart bot
sleep 2

echo "Probando que el bot responde en internet..."
curl -fsS -o /dev/null -X POST -H 'Content-Type: application/json' -d '{}' "$URL" && echo "  El bot responde." || { echo "  El bot no responde en $DOMINIO. Revise: systemctl status bot"; exit 1; }

echo "Conectando el webhook en 360dialog..."
RESP=$(curl -sS -w '\n%{http_code}' -X POST "https://waba-v2.360dialog.io/v1/configs/webhook" \
  -H "D360-API-KEY: ${CLAVE}" -H 'Content-Type: application/json' -d "{\"url\":\"${URL}\"}")
CODIGO=$(echo "$RESP" | tail -1)
if [ "$CODIGO" = "200" ] || [ "$CODIGO" = "201" ]; then
  echo "LISTO: 360dialog ya manda los mensajes de WhatsApp al bot."
else
  echo "360dialog respondió $CODIGO:"; echo "$RESP" | head -n -1
  echo "Copie esta respuesta y envíesela a Claude (no contiene la clave)."
  exit 1
fi
