#!/usr/bin/env bash
# ============================================================
# Resonance — all-in-one VPS deploy for resonanse.app
# Run ON the server as root:
#   bash deploy-vps.sh "postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
#
# What it does: installs Docker+nginx, unpacks the app from
# /root/resonance-app-files.zip, writes a clean .env (secrets
# generated locally), builds + starts the container on
# 127.0.0.1:3019, switches nginx from the old site to Resonance
# (backs up old configs first), reuses the existing Let's
# Encrypt certificate if present.
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

echo "[6/8] Switching web traffic from the old site to Resonance..."
echo "  current listeners on 80/443 (diagnostic):"
ss -ltnp 2>/dev/null | grep -E ':(80|443)\b' || echo "  (none found)"
# stop old docker containers publishing web ports (old landing page)
for c in $(docker ps --format '{{.Names}} {{.Ports}}' | grep -E ':(80|443)->' | awk '{print $1}'); do
  [[ "$c" == "resonance" ]] && continue
  echo "  stopping old web container: $c"
  docker stop "$c" >/dev/null 2>&1 || true
done
# back up and clear old nginx sites
BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true
rm -f /etc/nginx/sites-enabled/*
echo "  old nginx configs backed up to $BK"

CERT_DIR="$(ls -d /etc/letsencrypt/live/*resonanse* 2>/dev/null | head -1 || true)"
if [[ -n "$CERT_DIR" && -f "$CERT_DIR/fullchain.pem" ]]; then
  echo "  existing SSL certificate found at $CERT_DIR — configuring HTTPS"
  cat > /etc/nginx/sites-available/resonance <<NGX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://$DOMAIN\$request_uri;
}
server {
    listen 443 ssl;
    server_name www.$DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    return 301 https://$DOMAIN\$request_uri;
}
server {
    listen 443 ssl;
    server_name $DOMAIN;
    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    client_max_body_size 25m;
    location / {
        proxy_pass http://$HOST_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGX
else
  echo "  no SSL certificate found — configuring HTTP only."
  echo "  AFTER the site loads, run:  apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  cat > /etc/nginx/sites-available/resonance <<NGX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 25m;
    location / {
        proxy_pass http://$HOST_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
NGX
fi
ln -sf /etc/nginx/sites-available/resonance /etc/nginx/sites-enabled/resonance
nginx -t
systemctl reload nginx

echo "[7/8] Waiting for the app to answer..."
ok=""
for i in $(seq 1 40); do
  if curl -sf "http://$HOST_PORT/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done

echo "[8/8] Finished."
if [[ -n "$ok" ]]; then
  echo "============================================================"
  echo " SUCCESS — Resonance is live at https://$DOMAIN"
  echo "============================================================"
else
  echo "The app did not answer yet. Check what it said:"
  echo "  docker logs resonance --tail 50"
fi
