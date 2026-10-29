#!/usr/bin/env bash
# Actualiza travelbot a la ultima version del repo, recompila y reinicia el servicio.
# Uso: sudo bash deploy/update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root: sudo bash deploy/update.sh" >&2; exit 1; }

git -C "$APP_DIR" pull --ff-only
# install.sh es idempotente: reinstala dependencias, compila, actualiza el servicio y reinicia.
exec bash "$APP_DIR/deploy/install.sh"
