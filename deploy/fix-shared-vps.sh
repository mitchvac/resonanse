#!/usr/bin/env bash
# fix-shared-vps.sh — run ON 144.91.66.158 as root.
# Puts Resonance AEO files on disk for nginx alias, removes default_server
# from the Resonance vhost, and does NOT touch wflowprocess.app sites.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/resonance}"
mkdir -p "$APP_DIR/public"

# Copy AEO files from this repo checkout if present.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for f in llms.txt robots.txt sitemap.xml; do
  if [[ -f "$HERE/public/$f" ]]; then
    cp -f "$HERE/public/$f" "$APP_DIR/public/$f"
    echo "installed $APP_DIR/public/$f"
  elif [[ -f "$APP_DIR/public/$f" ]]; then
    echo "kept existing $APP_DIR/public/$f"
  else
    echo "WARN: $f not found in $HERE/public or $APP_DIR/public" >&2
  fi
done

# Strip default_server so unknown Hosts (wflowprocess.app) are not captured.
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/resonance /etc/nginx/sites-available/resonanse; do
  [[ -f "$f" ]] || continue
  if grep -q 'resonanse.app' "$f" && grep -q 'default_server' "$f"; then
    echo "removing default_server from $f"
    sed -i 's/ default_server//g' "$f"
  fi
done

# Drop any catch-all 301 to resonanse.app that steals other Hosts.
for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/*; do
  [[ -f "$f" ]] || continue
  if grep -q 'return 301 https://resonanse.app' "$f" && ! grep -q 'server_name www.resonanse.app' "$f"; then
    if ! grep -q 'server_name resonanse.app' "$f"; then
      echo "WARN: $f 301s to resonanse.app without a Resonance server_name — inspect" >&2
    fi
  fi
done

nginx -t
systemctl reload nginx
echo "Resonance AEO:"
curl -sS -o /dev/null -w "  /llms.txt     %{http_code}\n" https://resonanse.app/llms.txt || true
curl -sS -o /dev/null -w "  /robots.txt   %{http_code}\n" https://resonanse.app/robots.txt || true
curl -sS -o /dev/null -w "  /sitemap.xml  %{http_code}\n" https://resonanse.app/sitemap.xml || true
echo "If wflowprocess.app still 301s here, run the sibling script:"
echo "  sudo bash /opt/hermes-workflow-orchestrator/scripts/restore-wflowprocess-vhost.sh"
