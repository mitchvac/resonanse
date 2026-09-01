#!/usr/bin/env bash
# ============================================================
# Resonance — all-in-one VPS deploy for resonanse.app
# on the SHARED 144.91.66.158 box.
#
# This host ALSO serves botcentral.org, citefleet.app,
# wflowprocess.app (+ sign. / wearables. subdomains).
# NEVER rm /etc/nginx/sites-enabled/* — that deletes the other
# sites' vhosts and serves their hostnames the wrong TLS cert
# (2026-09-01 incident: wflowprocess.app answered with the
# botcentral.org certificate). This script only ever touches
# its OWN vhost file and symlink.
#
# Run ON the server as root:
#   bash deploy-vps.sh "postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
#
# What it does: installs Docker+nginx if missing, uses the app
# source already in /opt/resonance (or unpacks
# /root/resonance-app-files.zip), preserves operator-added .env
# keys and APP_SECRET across redeploys, builds + starts the
# container on 127.0.0.1:3019, writes ONLY the resonance vhost
# (with security headers + AEO aliases), reuses the existing
# Let's Encrypt certificate if present.
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

echo "[2/8] Preparing app files in $APP_DIR ..."
mkdir -p "$APP_DIR"
if [[ -f "$APP_DIR/package.json" ]]; then
  echo "  app source already present (e.g. git clone) — skipping unzip"
else
  ZIP="$(ls /root/resonance-app-files.zip "$HOME"/resonance-app-files.zip 2>/dev/null | head -1 || true)"
  if [[ -z "$ZIP" ]]; then
    echo "ERROR: no app source found. Either:"
    echo "  git clone https://github.com/mitchvac/resonanse.git $APP_DIR"
    echo "or upload the zip from your Mac:"
    echo "  scp ~/Downloads/resonance-app-files.zip root@144.91.66.158:/root/"
    exit 1
  fi
  unzip -qo "$ZIP" -d "$APP_DIR"
fi
cd "$APP_DIR"
mkdir -p public

echo "[3/8] Writing .env (APP_SECRET generated locally — never leaves this server)..."
# Preserve operator-added keys across redeploys (secrets, third-party keys,
# merchant addresses) so re-running this script never wipes them.
PRESERVE_KEYS="IDENTITY_VAULT_KEY CUSTOMER_REF_SECRET RESEND_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REDIRECT_URI LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET MERCHANT_XRP_ADDRESS MERCHANT_XLM_ADDRESS URLHAUS_AUTH_KEY OWNER_UNION_ID ADMIN_EMAIL LIBRETRANSLATE_URL WHISPER_URL PIPER_URL VITE_H5_ADS_CLIENT VITE_H5_ADS_TEST"
declare -A PRESERVED=()
if [[ -f .env ]]; then
  while IFS='=' read -r k v; do
    for pk in $PRESERVE_KEYS; do
      if [[ "$k" == "$pk" ]]; then PRESERVED[$k]="$v"; fi
    done
  done < .env
fi
# Keep the existing APP_SECRET on redeploys so active sessions are not logged out.
if [[ -z "${PRESERVED[APP_SECRET]:-}" ]] && [[ -f .env ]]; then
  existing_secret="$(grep -E '^APP_SECRET=' .env | head -1 | cut -d= -f2- || true)"
  if [[ -n "$existing_secret" ]]; then PRESERVED[APP_SECRET]="$existing_secret"; fi
fi
APP_SECRET="${PRESERVED[APP_SECRET]:-$(openssl rand -hex 32)}"
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
  for pk in $PRESERVE_KEYS; do
    if [[ -n "${PRESERVED[$pk]:-}" ]]; then printf '%s=%s\n' "$pk" "${PRESERVED[$pk]}"; fi
  done
} > .env
chmod 600 .env

echo "[4/8] Building Docker image (first build takes 5-10 minutes)..."
docker build -t resonance .

echo "[5/8] Starting container on $HOST_PORT ..."
docker rm -f resonance >/dev/null 2>&1 || true
docker run -d --name resonance --restart unless-stopped \
  --env-file .env -p "$HOST_PORT":3000 resonance

echo "[6/8] Writing the resonance nginx vhost (other sites untouched)..."
echo "  current listeners on 80/443 (diagnostic):"
ss -ltnp 2>/dev/null | grep -E ':(80|443)\b' || echo "  (none found)"
# stop old docker containers publishing web ports directly (old landing page)
for c in $(docker ps --format '{{.Names}} {{.Ports}}' | grep -E ':(80|443)->' | awk '{print $1}'); do
  [[ "$c" == "resonance" ]] && continue
  echo "  stopping old web container: $c"
  docker stop "$c" >/dev/null 2>&1 || true
done
# Back up the enabled sites for forensics. Intentionally does NOT delete
# other sites-enabled files — this box is shared (see header).
BK="/root/nginx-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
cp -a /etc/nginx/sites-enabled/. "$BK"/ 2>/dev/null || true
echo "  enabled sites backed up to $BK (nothing deleted)"

CERT_DIR="$(ls -d /etc/letsencrypt/live/*resonanse* 2>/dev/null | head -1 || true)"
AEO=$(cat <<'LOC'
    location = /llms.txt { alias /opt/resonance/public/llms.txt; default_type text/plain; charset utf-8; }
    location = /robots.txt { alias /opt/resonance/public/robots.txt; default_type text/plain; charset utf-8; }
    location = /sitemap.xml { alias /opt/resonance/public/sitemap.xml; default_type application/xml; charset utf-8; }
    location = /.well-known/botcentral.txt { alias /opt/resonance/public/.well-known/botcentral.txt; default_type text/plain; charset utf-8; }
LOC
)
# Security headers — keep in sync with deploy/nginx-resonanse.conf (see the
# comments there for the CSP hash recompute command).
SEC=$(cat <<'HDR'
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-bYWiin1dnqUAQCPDEcAAh201xjP0jvZJ1hVzRHm0o6Q=' https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://www.googletagservices.com https://partner.googleadservices.com https://adservice.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.gstatic.com; media-src 'self' blob:; frame-src 'self' https://www.openstreetmap.org https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com; connect-src 'self' wss://resonanse.app https://*.googlesyndication.com https://*.doubleclick.net https://adservice.google.com https://*.google.com https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests" always;
HDR
)

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
$SEC
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
  echo "  no SSL certificate found — configuring HTTP only."
  echo "  AFTER the site loads, run:  apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  cat > /etc/nginx/sites-available/resonance <<NGX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    client_max_body_size 25m;
$SEC
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
  echo " (sibling vhosts left intact: botcentral / citefleet / wflowprocess)"
  echo "============================================================"
else
  echo "The app did not answer yet. Check what it said:"
  echo "  docker logs resonance --tail 50"
fi

# ============================================================
# IndexNow ping — instantly notifies Bing & partner engines
# (Yandex, Naver, Seznam.cz, Yep) that our public pages changed.
# Protocol: https://www.indexnow.org/documentation
# We host the key file at https://$DOMAIN/<key>.txt (served from
# public/<key>.txt via the vite build) and POST a JSON payload
# {host, key, keyLocation, urlList} to api.indexnow.org.
# Fully failure-tolerant: a ping failure must NEVER fail a deploy.
# Can also be re-run manually: bash scripts/indexnow-ping.sh
# ============================================================
INDEXNOW_KEY_FILE=""
for f in "$APP_DIR"/public/*.txt; do
  [[ -e "$f" ]] || continue
  name="$(basename "$f" .txt)"
  if [[ "$name" =~ ^[0-9a-f]{32}$ ]]; then
    INDEXNOW_KEY_FILE="$f"
    break
  fi
done

if [[ -z "$INDEXNOW_KEY_FILE" ]]; then
  echo "IndexNow: skipped (no key file public/<32-hex>.txt found)."
else
  INDEXNOW_KEY="$(tr -d '[:space:]' < "$INDEXNOW_KEY_FILE")"
  # Public routes mirrored from public/sitemap.xml — keep in sync.
  INDEXNOW_ROUTES=("/" "/premium" "/privacy" "/terms" "/cookies" "/guidelines" "/report" "/data")
  INDEXNOW_URL_LIST=""
  for route in "${INDEXNOW_ROUTES[@]}"; do
    [[ -n "$INDEXNOW_URL_LIST" ]] && INDEXNOW_URL_LIST+=","
    INDEXNOW_URL_LIST+="\"https://$DOMAIN${route}\""
  done
  INDEXNOW_PAYLOAD="{\"host\":\"$DOMAIN\",\"key\":\"$INDEXNOW_KEY\",\"keyLocation\":\"https://$DOMAIN/$(basename "$INDEXNOW_KEY_FILE")\",\"urlList\":[${INDEXNOW_URL_LIST}]}"
  INDEXNOW_HTTP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "https://api.indexnow.org/indexnow" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$INDEXNOW_PAYLOAD" 2>/dev/null)" || true
  case "$INDEXNOW_HTTP" in
    200|202) echo "IndexNow: pinged ${#INDEXNOW_ROUTES[@]} URLs for $DOMAIN (HTTP $INDEXNOW_HTTP).";;
    000|"")  echo "IndexNow: skipped (api.indexnow.org unreachable; non-fatal).";;
    *)       echo "IndexNow: ping returned HTTP $INDEXNOW_HTTP (non-fatal).";;
  esac
fi
