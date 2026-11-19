#!/usr/bin/env bash
# Instala la ejecución local de cortes y reactivaciones cada cinco minutos.
set -Eeuo pipefail

ENV_FILE="${1:-/opt/meganet-deploy/.env.production}"
[[ $EUID -eq 0 ]] || { echo "Ejecuta como root" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "No existe $ENV_FILE" >&2; exit 1; }

if ! grep -q '^CRON_SECRET=.' "$ENV_FILE"; then
  printf '\nCRON_SECRET=%s\n' "$(openssl rand -hex 32)" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

cat > /usr/local/sbin/meganet-run-cutoffs <<'SCRIPT'
#!/usr/bin/env bash
set -u
ENV_FILE="${MEGANET_ENV:-/opt/meganet-deploy/.env.production}"
SECRET="$(sed -n 's/^CRON_SECRET=//p' "$ENV_FILE" | tail -1)"
[[ -n "$SECRET" ]] || exit 0
curl -fsS --max-time 120 \
  -X POST "http://127.0.0.1:3000/api/public/hooks/sync-mikrotik" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{}' >> /var/log/meganet-cutoffs.log 2>&1
SCRIPT
chmod 700 /usr/local/sbin/meganet-run-cutoffs

cat > /etc/cron.d/meganet-cutoffs <<'CRON'
# Cortes por deuda y reintentos de reactivación en los routers.
*/5 * * * * root /usr/local/sbin/meganet-run-cutoffs
CRON
chmod 644 /etc/cron.d/meganet-cutoffs
