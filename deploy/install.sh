#!/usr/bin/env bash
# Instala travelbot como servicio systemd en un VPS Linux.
# Uso (desde la carpeta del repo clonado, p. ej. /opt/travelbot):
#   sudo bash deploy/install.sh
# Es idempotente: puedes volver a ejecutarlo sin romper nada.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE=/etc/travelbot.env
STATE_DIR=/var/lib/travelbot
UNIT=/etc/systemd/system/travelbot.service

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta como root: sudo bash deploy/install.sh"
command -v systemctl >/dev/null || die "Este VPS no usa systemd."

say "Comprobando Node.js"
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "Node.js no está instalado. Instala Node 20+:
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs"
NODE_BIN="$(readlink -f "$NODE_BIN")"
case "$NODE_BIN" in
  /root/*|/home/*) die "Node está en $NODE_BIN (nvm). El servicio no puede leer carpetas personales.
  Instala Node a nivel de sistema (NodeSource o el paquete de tu distro)." ;;
esac
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=6)?0:1)' \
  || die "Necesitas Node >= 20.6 (tienes $("$NODE_BIN" -v))."
echo "Node $("$NODE_BIN" -v) en $NODE_BIN"

say "Usuario de sistema 'travelbot'"
id travelbot >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin travelbot
echo "ok"

say "Instalando dependencias y compilando"
cd "$APP_DIR"
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund

say "Configuración ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 -o root -g root deploy/travelbot.env.example "$ENV_FILE"
  echo "Creado $ENV_FILE desde la plantilla."
fi

say "Datos ($STATE_DIR)"
install -d -m 750 -o travelbot -g travelbot "$STATE_DIR"
if [ ! -f "$STATE_DIR/db.json" ] && [ -f data/db.json ]; then
  install -m 640 -o travelbot -g travelbot data/db.json "$STATE_DIR/db.json"
  echo "Copiado data/db.json del repo (alertas existentes)."
fi

say "Servicio systemd"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__NODE__#$NODE_BIN#g" deploy/travelbot.service > "$UNIT"
systemctl daemon-reload
systemctl enable travelbot >/dev/null

if ! grep -qE '^TELEGRAM_BOT_TOKEN=.+' "$ENV_FILE" || ! grep -qE '^TRAVELPAYOUTS_TOKEN=.+' "$ENV_FILE"; then
  say "Falta rellenar los tokens"
  echo "Edita $ENV_FILE (TELEGRAM_BOT_TOKEN y TRAVELPAYOUTS_TOKEN) y luego:"
  echo "  sudo systemctl restart travelbot"
  exit 0
fi

systemctl restart travelbot
sleep 3
say "Estado"
systemctl --no-pager --lines=10 status travelbot || true
echo
echo "Logs en directo:  journalctl -u travelbot -f"
echo "Actualizar:       sudo bash $APP_DIR/deploy/update.sh"
