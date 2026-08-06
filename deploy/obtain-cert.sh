#!/bin/sh
# First TLS certificate, over the webroot.
# Domain: Deploy
#
#   ./deploy/obtain-cert.sh saturnprep.uz you@example.com
#
# Webroot rather than the runbook's older --standalone: standalone wants port 80
# to itself, so it means stopping Nginx — taking the site down to renew the
# certificate that keeps it up. Nginx already serves /.well-known/acme-challenge
# from the shared certbot_www volume, so it can stay running.
#
# Refuses to run until the domain actually resolves here. Let's Encrypt rate
# limits failed authorizations (5 per account per hostname per hour), and the
# usual way to burn them is retrying against DNS that has not propagated yet.
set -eu

DOMAIN="${1:?usage: obtain-cert.sh <domain> <email>}"
EMAIL="${2:?usage: obtain-cert.sh <domain> <email>}"
CERT_NAME="${CERT_NAME:-satfergana}"
COMPOSE="docker compose -f docker-compose.prod.yml"

# Resolve the way the world will, not the way this box might (a hosts entry or a
# local override would answer for us and prove nothing about what Let's Encrypt
# will see).
want=$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || echo "")
got=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo "")

if [ -z "$got" ]; then
  echo "[cert] $DOMAIN does not resolve yet. Nothing to do — the certificate"
  echo "[cert] request would fail and spend a rate-limit slot. Try again later."
  exit 1
fi
if [ -n "$want" ] && [ "$got" != "$want" ]; then
  echo "[cert] $DOMAIN resolves to $got, but this server is $want."
  echo "[cert] Fix the A record first; a challenge served here will not be read."
  exit 1
fi
echo "[cert] $DOMAIN -> $got (this server). Requesting."

# A self-signed placeholder may be sitting at the target path so Nginx could
# start before any real certificate existed. Certbot would treat that directory
# as an existing lineage and try to renew something it never issued.
$COMPOSE run --rm --entrypoint sh certbot -c \
  "if [ -f /etc/letsencrypt/live/$CERT_NAME/fullchain.pem ] && \
      ! [ -f /etc/letsencrypt/renewal/$CERT_NAME.conf ]; then \
     echo '[cert] removing self-signed placeholder'; \
     rm -rf /etc/letsencrypt/live/$CERT_NAME; \
   fi"

$COMPOSE run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --cert-name "$CERT_NAME" \
  --agree-tos -m "$EMAIL" --no-eff-email \
  --non-interactive

echo "[cert] issued. Reloading Nginx."
$COMPOSE exec nginx nginx -s reload
echo "[cert] done. Renewal is automatic — see the certbot service."
