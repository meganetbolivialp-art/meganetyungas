#!/usr/bin/env bash
# =============================================================
#  MIKROSYSTEM · Sincronizar token del agente VPN
# =============================================================
#  Uso en el VPS de la VPN (como root):
#
#   1) Ver el token que usa el agente ahora:
#        bash agent-sync-token.sh show
#
#   2) Poner un token específico (el mismo que guardás en el panel):
#        bash agent-sync-token.sh set <TOKEN_DE_64_HEX>
#
#   3) Generar un token nuevo y mostrarlo (después pegalo en el panel):
#        bash agent-sync-token.sh rotate
#
#  El token debe ser idéntico en el panel (MIKROTIK_AGENT_TOKEN)
#  y en el servicio systemd `mikrotik-agent` del VPS.
# =============================================================
set -euo pipefail

UNIT=/etc/systemd/system/mikrotik-agent.service
ACTION="${1:-show}"

current_token() {
  systemctl show mikrotik-agent -p Environment --value 2>/dev/null \
    | tr ' ' '\n' | grep '^MIKROTIK_AGENT_TOKEN=' | cut -d= -f2- || true
}

set_token() {
  local tok="$1"
  if [[ ${#tok} -lt 32 ]]; then
    echo "ERROR: el token debe tener al menos 32 caracteres" >&2
    exit 1
  fi
  [[ -f "$UNIT" ]] || { echo "ERROR: no existe $UNIT (¿está instalado el agente?)" >&2; exit 1; }
  if grep -q '^Environment=MIKROTIK_AGENT_TOKEN=' "$UNIT"; then
    sed -i "s|^Environment=MIKROTIK_AGENT_TOKEN=.*|Environment=MIKROTIK_AGENT_TOKEN=${tok}|" "$UNIT"
  else
    sed -i "/^\[Service\]/a Environment=MIKROTIK_AGENT_TOKEN=${tok}" "$UNIT"
  fi
  umask 077
  printf '%s\n' "$tok" > /root/mikrotik-agent-token.txt
  systemctl daemon-reload
  systemctl restart mikrotik-agent
  sleep 1
  systemctl is-active mikrotik-agent >/dev/null && echo "OK: agente reiniciado con el token nuevo." \
    || { echo "ERROR: el agente no arrancó. Ver: journalctl -u mikrotik-agent -n 40 --no-pager" >&2; exit 1; }
}

case "$ACTION" in
  show)
    TOK="$(current_token)"
    if [[ -z "$TOK" ]]; then
      echo "El agente no tiene MIKROTIK_AGENT_TOKEN configurado."
      exit 1
    fi
    echo "Token actual del agente (copiá este valor EXACTO al panel):"
    echo "$TOK"
    echo
    echo "Fingerprint TLS del agente:"
    openssl x509 -in /etc/mikrotik-agent/cert.pem -noout -fingerprint -sha256 2>/dev/null \
      | cut -d= -f2 | tr -d ':' | tr 'A-Z' 'a-z' || echo "(no encontrado)"
    ;;
  set)
    set_token "${2:?Falta el token: bash agent-sync-token.sh set <TOKEN>}"
    ;;
  rotate)
    NEW="$(openssl rand -hex 32)"
    set_token "$NEW"
    echo "Token nuevo (pegalo en el panel):"
    echo "$NEW"
    ;;
  *)
    echo "Uso: bash agent-sync-token.sh [show|set <TOKEN>|rotate]" >&2
    exit 1
    ;;
esac
