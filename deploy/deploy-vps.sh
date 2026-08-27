#!/usr/bin/env bash
# ============================================================
# Resonance — VPS deploy for resonanse.app on the SHARED box.
# Run ON the server as root.
#
# This host also serves wflowprocess.app. This script MUST NOT
# delete /etc/nginx/sites-enabled/* and MUST NOT become default_server.
# ============================================================
set -euo pipefail

DB_URL="${1:-}"
if [[ ! "$DB_URL" =~ ^postgres:// ]]; then
  echo "ERROR: pass your Supabase Transaction pooler URL as the only argument."
  echo 'Usage: bash deploy-vps.sh "postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"'
  exit 1
fi

DOMAIN="resonanse.app"
APP_DIR="/opt/resonance"
HOST_PORT="127.0.0.1:3019"

echo "[1/8] Installing prerequisites (docker, unzip, nginx)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq unzip curl openssl ca-certificates >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v nginx >/dev/null 2>&1; then
  apt-get install -y -qq nginx >/dev/null
fi

echo "[2/8] Unpacking Resonance into $APP_DIR ..."
ZIP="$(ls /root/resonance-app-files.zip "$HOME"/resonance-app-files.zip 2>/dev/null | head -1 || true)"
if [[ -z "$ZIP" ]]; then
  echo "ERROR: /root/resonance-app-files.zip not found."
  echo "Upload it from your Mac first:"
  echo "  scp ~/Downloads/resonance-app-files.zip root@144.91.66.158:/root/"
  exit 1
fi
mkdir -p "$APP_DIR"
unzip -qo "$ZIP" -d "$APP_DIR"
cd "$APP_DIR"
# Keep AEO files next to the unpacked tree so nginx can alias them.
mkdir -p public

echo "[3/8] Writing .env (APP_SECRET generated locally — never leaves this server)..."
APP_SECRET="$(openssl rand -hex 32)"
{
  echo "NODE_ENV=production"
  echo "PORT=3000"
  echo "APP_ID=resonance"
  echo "APP_SECRET=$APP_SECRET"
  echo "APP_URL=https://$DOMAIN"
  printf 'DATABASE_URL=%s\n' "$DB_URL"
  echo "KIMI_AUTH_URL=https://auth.kimi.com"
  echo "KIMI_OPEN_URL=https://open.kimi.com"
  echo "EMAIL_FROM=Resonance <no-reply@$DOMAIN>"
  echo "KALSHI_REFERRAL_URL=https://kalshi.com/r/492bccee-98d1-4164-9f7d-6cef7b2766f5"
} > .env
chmod 600 .env

echo "[4/8] Building Docker image (first build takes 5-10 minutes)..."
docker build -t resonance .

echo "[5/8] Starting container on $HOST_PORT ..."
docker rm -f resonance >/dev/null 2>&1 || true
docker run -d --name resonance --restart unless-stopped \
  --env-file .env -p "$HOST_PORT":3000 resonance

echo "[6/8] Writing the Resonance vhost — leaving every other site alone..."
echo "  current listeners on 80/443 (diagnostic):"
ss -ltnp 2>/dev/null | grep -E ':(80|443)\b' || echo "  (none found)"
# Do NOT stop other web containers. wflowprocess frontend/backend bind loopback.
# Do NOT rm sites-enabled/* — that 301'd wflowprocess.app onto this app.
BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true
cp -a /etc/nginx/sites-available/resonance "$BK"/ 2>/dev/null || true
echo "  nginx backup at $BK"

CERT_DIR="$(ls -d /etc/letsencrypt/live/*resonanse* 2>/dev/null | head -1 || true)"
AEO=""
AEO+=$'    location = /llms.txt { alias '