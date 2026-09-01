#!/usr/bin/env bash
# Resonance VPS deploy for resonanse.app on the SHARED 144 box.
# This host also serves wflowprocess.app. Never rm sites-enabled/*.
set -euo pipefail

DB_URL="${1:-}"
if [[ ! "$DB_URL" =~ ^postgres:// ]]; then
  echo "Usage: bash deploy-vps.sh \"postgres://...\""
  exit 1
fi

DOMAIN="resonanse.app"
APP_DIR="/opt/resonance"
HOST_PORT="127.0.0.1:3019"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq unzip curl openssl ca-certificates >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v nginx >/dev/null || apt-get install -y -qq nginx >/dev/null

ZIP="$(ls /root/resonance-app-files.zip "$HOME"/resonance-app-files.zip 2>/dev/null | head -1 || true)"
[[ -n "$ZIP" ]] || { echo "ERROR: resonance-app-files.zip not found"; exit 1; }
mkdir -p "$APP_DIR"
unzip -qo "$ZIP" -d "$APP_DIR"
cd "$APP_DIR"
mkdir -p public

APP_SECRET="$(openssl rand -hex 32)"
{
  echo "NODE_ENV=production"
  echo "PORT=3000"
  echo "APP_ID=resonance"
  echo "APP_SECRET=$APP_SECRET"
  echo "APP_URL=https://$DOMAIN"
  printf 'DATABASE_URL=%s\n' "$DB_URL"
} > .env
chmod 600 .env

docker build -t resonance .
docker rm -f resonance >/dev/null 2>&1 || true
docker run -d --name resonance --restart unless-stopped --env-file .env -p "$HOST_PORT":3000 resonance

BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true
# Intentionally does NOT delete other sites-enabled files.

CERT_DIR="$(ls -d /etc/letsencrypt/live/*resonanse* 2>/dev/null | head -1 || true)"
AEO=$(cat <<'LOC'
    location = /llms.txt { alias /opt/resonance/public/llms.txt; default_type text/plain; charset utf-8; }
    location = /robots.txt { alias /opt/resonance/public/robots.txt; default_type text/plain; charset utf-8; }
    location = /sitemap.xml { alias /opt/resonance/public/sitemap.xml; default_type application/xml; charset utf-8; }
    location = /.well-known/botcentral.txt { alias /opt/resonance/public/.well-known/botcentral.txt; default_type text/plain; charset utf-8; }
LOC
)

if [[ -n "$CERT_DIR" && -f "$CERT_DIR/fullchain.pem" ]]; then
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
$AEO
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
  cat > /etc/nginx/sites-available/resonance <<NGX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 25m;
$AEO
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
ln -sfn /etc/nginx/sites-available/resonance /etc/nginx/sites-enabled/resonance
nginx -t
systemctl reload nginx

ok=""
for i in $(seq 1 40); do
  if curl -sf "http://$HOST_PORT/" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
if [[ -n "$ok" ]]; then
  echo "SUCCESS — Resonance at https://$DOMAIN (wflowprocess.app vhost left intact)"
else
  echo "App did not answer yet. docker logs resonance --tail 50"
fi
