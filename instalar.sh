#!/usr/bin/env bash
# Instala el bot de Editora Ortega en un servidor Ubuntu 24.04 nuevo.
# Uso (como root, en la consola del servidor):
#   bash <(curl -fsSL https://raw.githubusercontent.com/andyortegar/bot-editora/main/instalar.sh)
set -euo pipefail

REPO="https://github.com/andyortegar/bot-editora.git"
DIR=/opt/bot
DOMINIO=panel.editoraortega.com

preguntar() { local var=$1 texto=$2 oculto=${3:-}; local v=""; if [ -n "$oculto" ]; then read -rsp "$texto: " v </dev/tty; echo; else read -rp "$texto: " v </dev/tty; fi; printf -v "$var" '%s' "$v"; }
azar() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

echo "== 1/6 Paquetes del sistema =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw >/dev/null

if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "Node $(node -v), $(caddy version | cut -d' ' -f1)"

echo "== 2/6 Código del bot =="
git config --global --add safe.directory "$DIR"
id bot >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin bot
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q; else git clone -q "$REPO" "$DIR"; fi
mkdir -p "$DIR/datos"
(cd "$DIR" && node --test test/*.test.js >/tmp/pruebas.txt 2>&1) && echo "Pruebas: todas pasaron" || { echo "Fallaron las pruebas:"; tail -20 /tmp/pruebas.txt; exit 1; }

echo "== 3/6 Claves =="
if [ -f "$DIR/.env" ]; then
  echo "Ya existe $DIR/.env; se conserva. (Para cambiar una clave: nano $DIR/.env)"
else
  echo "Pegue cada valor y presione Enter. Lo que tenga oculto no se ve al escribir; es normal."
  preguntar TG_TOKEN "Token del bot de Telegram (de BotFather)" oculto
  preguntar CLAUDE "Clave de la API de Claude (sk-ant-...)" oculto
  preguntar D360 "Clave de 360dialog (si todavía no la tiene, solo presione Enter)" oculto
  preguntar PANEL "Contraseña para el panel web (invéntela; usuario: veronica)" oculto

  echo
  echo "Buscando quién le escribió /start al bot de Telegram..."
  curl -fsS "https://api.telegram.org/bot${TG_TOKEN}/deleteWebhook" >/dev/null || true
  curl -fsS "https://api.telegram.org/bot${TG_TOKEN}/getUpdates" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const vistos={};
      for(const u of r.result||[]){const c=(u.message||u.my_chat_member||{}).chat;if(c&&!vistos[c.id]){vistos[c.id]=1;console.log(`  ${c.id}  ${[c.first_name,c.last_name].filter(Boolean).join(" ")||c.title||""}`);}}
      if(!Object.keys(vistos).length)console.log("  (nadie todavía: abra el bot en Telegram, toque Iniciar y vuelva a correr este instalador)");});'
  preguntar TG_VERONICA "Número de chat de Verónica (de la lista de arriba)"
  preguntar TG_DUENO "Número de chat del dueño (de la lista de arriba)"

  umask 077
  cat > "$DIR/.env" <<EOF
PUERTO=3000
ARCHIVO_DATOS=datos/estado.json
D360_API_KEY=${D360}
WEBHOOK_SECRETO=$(azar)
TELEGRAM_TOKEN=${TG_TOKEN}
TELEGRAM_CHAT_ID=${TG_VERONICA}
TELEGRAM_SECRETO=$(azar)
TELEGRAM_CHAT_SUPERVISOR=${TG_DUENO}
ALERTA_ESPERA_MIN=30
ANTHROPIC_API_KEY=${CLAUDE}
MODELO_IA=claude-haiku-5-5
MAX_USOS_IA=4
PANEL_USUARIO=veronica
PANEL_CLAVE=${PANEL}
EOF
fi
chown -R bot:bot "$DIR"
chmod 600 "$DIR/.env"

echo "== 4/6 Servicio y HTTPS =="
cat > /etc/systemd/system/bot.service <<EOF
[Unit]
Description=Bot de WhatsApp de Editora Ortega
After=network.target

[Service]
WorkingDirectory=$DIR
ExecStart=/usr/bin/node servidor/index.js
Restart=always
User=bot

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
    reverse_proxy localhost:3000
}
EOF
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
systemctl daemon-reload
systemctl enable --now bot >/dev/null 2>&1
systemctl restart bot caddy

echo "== 5/6 Esperando el certificado HTTPS de $DOMINIO =="
ok=""
for i in $(seq 1 30); do
  if curl -fsS "https://$DOMINIO/salud" >/dev/null 2>&1; then ok=1; break; fi
  sleep 10
done
[ -n "$ok" ] && echo "https://$DOMINIO responde." || echo "Todavía no responde por HTTPS (revise el registro A 'panel' en GoDaddy). El resto quedó instalado; vuelva a correr el instalador más tarde."

echo "== 6/6 Conectar Telegram =="
set -a; . "$DIR/.env"; set +a
if [ -n "$ok" ]; then
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
    --data-urlencode "url=https://$DOMINIO/webhook/telegram" \
    --data-urlencode "secret_token=${TELEGRAM_SECRETO}" >/dev/null && echo "Telegram conectado."
fi

echo
echo "================ LISTO ================"
echo "Panel:   https://$DOMINIO/panel   (usuario: veronica)"
echo "Webhook para 360dialog (guárdelo, se usa al conectar el número):"
echo "   https://$DOMINIO/webhook/whatsapp/${WEBHOOK_SECRETO}"
echo "Estado del bot:   systemctl status bot"
echo "Actualizar luego: bash $DIR/actualizar.sh"
