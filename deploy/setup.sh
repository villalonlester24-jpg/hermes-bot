#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/hermes-bot
SERVICE_NAME=hermes-bot
NODE_MAJOR=22

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root:  sudo bash deploy/setup.sh"
  exit 1
fi

echo "==> 1/6 Installing Node.js ${NODE_MAJOR} (if needed)"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if [[ "${CUR}" -ge "${NODE_MAJOR}" ]]; then NEED_NODE=0; fi
fi
if [[ "${NEED_NODE}" -eq 1 ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
  else
    echo "Unsupported distro. Install Node.js ${NODE_MAJOR} manually, then re-run."
    exit 1
  fi
fi
echo "    node $(node -v)"

echo "==> 2/6 Creating service user 'hermes'"
if ! id hermes >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin hermes
fi

echo "==> 3/6 Copying app to ${APP_DIR}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${APP_DIR}"
if [[ "${SRC}" != "${APP_DIR}" ]]; then
  (cd "${SRC}" && tar --exclude=./node_modules --exclude=./data --exclude='*.log' -cf - .) \
    | (cd "${APP_DIR}" && tar -xf -)
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "ERROR: ${APP_DIR}/.env is missing. Copy your .env (with DISCORD_TOKEN) first."
  exit 1
fi

echo "==> 4/6 Installing dependencies (compiles native modules for this host)"
cd "${APP_DIR}"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "==> 5/6 Preparing logs + ownership"
touch /var/log/hermes-bot.log /var/log/hermes-bot.err.log
chown hermes:hermes /var/log/hermes-bot.log /var/log/hermes-bot.err.log
chown -R hermes:hermes "${APP_DIR}"

echo "==> 6/6 Installing systemd service"
cp "${APP_DIR}/deploy/${SERVICE_NAME}.service" "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

sleep 3
systemctl --no-pager --full status "${SERVICE_NAME}" | head -n 15 || true
echo
echo "Done. Live logs:   journalctl -u ${SERVICE_NAME} -f"
echo "Or file logs:      tail -f /var/log/hermes-bot.log"
echo "Restart:           sudo systemctl restart ${SERVICE_NAME}"
echo "Stop:              sudo systemctl stop ${SERVICE_NAME}"
