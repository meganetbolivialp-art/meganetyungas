#!/usr/bin/env bash
# ============================================================================
#  MEGANET - Instalador SoftEther VPN (SSTP) para VPS Contabo
#  Uso:   sudo bash install-vpn-contabo.sh
#  Deja:  SoftEther corriendo como servicio, hub MEGANET, SSTP en :443,
#         pool 10.10.0.0/24, SecureNAT habilitado.
#  Salida: /root/meganet-vpn-credentials.txt con contraseñas generadas.
# ============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

[[ $EUID -eq 0 ]] || { err "Ejecutar como root (sudo)"; exit 1; }

# ---------- 0) Chequeo previo del puerto 443 ---------------------------------
log "Chequeando que el puerto 443 esté libre..."
if ss -tlnp 2>/dev/null | grep -q ':443 '; then
  err "El puerto 443 está ocupado. Liberalo antes de continuar:"
  ss -tlnp | grep ':443 '
  exit 1
fi

# ---------- 1) Dependencias --------------------------------------------------
log "Instalando dependencias de compilación..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential gcc make libssl-dev libreadline-dev \
    libncurses5-dev zlib1g-dev wget curl ufw >/dev/null

# ---------- 2) Descarga y compilación ---------------------------------------
SE_VERSION="4.44-9807-rtm"
SE_DATE="2025.04.16"
SE_TARBALL="softether-vpnserver-v${SE_VERSION}-${SE_DATE}-linux-x64-64bit.tar.gz"
SE_URL="https://github.com/SoftEtherVPN/SoftEtherVPN_Stable/releases/download/v${SE_VERSION}/${SE_TARBALL}"

cd /opt
if [[ -d vpnserver ]]; then
  warn "/opt/vpnserver ya existe — se detiene servicio y se reemplaza"
  systemctl stop vpnserver 2>/dev/null || true
  rm -rf /opt/vpnserver
fi

log "Descargando SoftEther ${SE_VERSION}..."
if ! wget -q "${SE_URL}" -O "${SE_TARBALL}"; then
  err "Falló la descarga. Verificá conectividad."
  exit 1
fi

log "Compilando SoftEther (tarda 2–4 min)..."
tar xzf "${SE_TARBALL}"
rm -f "${SE_TARBALL}"
cd vpnserver
# aceptar licencia automáticamente
yes 1 | make >/dev/null 2>&1 || { err "Compilación falló"; exit 1; }
chmod 600 *
chmod 700 vpnserver vpncmd
cd /

# ---------- 3) Servicio systemd ---------------------------------------------
log "Creando servicio systemd 'vpnserver'..."
cat > /etc/systemd/system/vpnserver.service <<'EOF'
[Unit]
Description=SoftEther VPN Server (Meganet)
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
ExecStart=/opt/vpnserver/vpnserver start
ExecStop=/opt/vpnserver/vpnserver stop
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable vpnserver >/dev/null
systemctl start vpnserver
sleep 3

# ---------- 4) Credenciales aleatorias --------------------------------------
gen_pass() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 20; }
ADMIN_PASS="$(gen_pass)"
HUB_PASS="$(gen_pass)"
HUB_NAME="MEGANET"

# ---------- 5) Configuración vía vpncmd -------------------------------------
VPNCMD="/opt/vpnserver/vpncmd /server localhost:5555 /cmd"

log "Configurando password de admin del servidor..."
$VPNCMD ServerPasswordSet "${ADMIN_PASS}" >/dev/null

log "Creando Hub '${HUB_NAME}'..."
$VPNCMD /password:"${ADMIN_PASS}" HubCreate "${HUB_NAME}" /password:"${HUB_PASS}" >/dev/null

HUBCMD="/opt/vpnserver/vpncmd /server localhost:5555 /hub:${HUB_NAME} /password:${ADMIN_PASS} /cmd"

log "Habilitando SecureNAT en el hub (pool 10.10.0.0/24)..."
$HUBCMD SecureNatDisable >/dev/null 2>&1 || true
# Configurar red virtual del hub
$HUBCMD SecureNatHostSet /MAC:none /IP:10.10.0.1 /MASK:255.255.255.0 >/dev/null
# DHCP scope
$HUBCMD DhcpSet /START:10.10.0.100 /END:10.10.0.200 /MASK:255.255.255.0 \
  /EXPIRE:7200 /GW:10.10.0.1 /DNS:1.1.1.1 /DNS2:8.8.8.8 /DOMAIN:none /LOG:yes \
  /PUSHROUTE:"" >/dev/null
$HUBCMD SecureNatEnable >/dev/null

log "Habilitando listener SSTP en puerto 443..."
SERVERCMD="/opt/vpnserver/vpncmd /server localhost:5555 /password:${ADMIN_PASS} /cmd"
$SERVERCMD ServerCertRegenerate "$(hostname -I | awk '{print $1}')" >/dev/null 2>&1 || true
$SERVERCMD SstpEnable yes >/dev/null

# Vincular hub como default para SSTP
$SERVERCMD OpenVpnEnable no /PORTS:0 >/dev/null 2>&1 || true

# ---------- 6) Firewall ------------------------------------------------------
log "Abriendo puerto 443/tcp en UFW..."
ufw allow 443/tcp comment 'SoftEther SSTP' >/dev/null || true
ufw reload >/dev/null 2>&1 || true

# ---------- 7) Verificación final -------------------------------------------
sleep 2
if ss -tlnp | grep -q ':443 '; then
  log "SSTP escuchando en :443 correctamente"
else
  err "SSTP NO está escuchando en :443. Revisar journalctl -u vpnserver"
  exit 1
fi

# ---------- 8) Guardar credenciales -----------------------------------------
VPS_IP="$(hostname -I | awk '{print $1}')"
CREDS_FILE="/root/meganet-vpn-credentials.txt"
cat > "${CREDS_FILE}" <<EOF
================================================================
 MEGANET - SoftEther VPN instalado en $(date -Iseconds)
================================================================
 VPS IP:            ${VPS_IP}
 Puerto SSTP:       443
 Hub:               ${HUB_NAME}
 Server admin pass: ${ADMIN_PASS}
 Hub admin pass:    ${HUB_PASS}
 Pool VPN:          10.10.0.0/24  (gw 10.10.0.1)
================================================================

Para agregar un router:
  sudo bash /opt/meganet-deploy/vpn-add-router.sh <nombre> [ip-fija]

Ejemplo:
  sudo bash /opt/meganet-deploy/vpn-add-router.sh mercedes 10.10.0.11
================================================================
EOF
chmod 600 "${CREDS_FILE}"

# Guardar el admin pass para scripts posteriores
echo "${ADMIN_PASS}" > /opt/vpnserver/.admin_pass
chmod 600 /opt/vpnserver/.admin_pass

echo
log "============================================================"
log " Instalación completa. Credenciales en: ${CREDS_FILE}"
log "============================================================"
cat "${CREDS_FILE}"
