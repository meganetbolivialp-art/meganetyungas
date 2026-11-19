#!/usr/bin/env bash
# Construye un único archivo .run autocontenido para instalar Meganet sin GitHub.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-/mnt/documents/meganet-proxmox-completo.run}"
WORK_DIR="$(mktemp -d /tmp/meganet-package.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

ARCHIVE="$WORK_DIR/meganet-source.tar.gz"
mkdir -p "$(dirname "$OUTPUT")"

# Incluye únicamente código fuente y recursos; nunca credenciales ni builds.
tar -C "$ROOT_DIR" \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.lovable' \
  --exclude='.tanstack' \
  --exclude='.oj-cache' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='.output' \
  --exclude='*/.output' \
  --exclude='dist' \
  --exclude='*/dist' \
  --exclude='*.tsbuildinfo' \
  --exclude='*.run' \
  --exclude='roadmap.md' \
  -czf "$ARCHIVE" .

# Bloquea accidentalmente archivos sensibles o de repositorio en el paquete.
if tar -tzf "$ARCHIVE" | grep -E '(^|/)(\.git|\.env|node_modules|\.output)(/|$)|\.tsbuildinfo$' >/dev/null; then
  echo "El paquete contiene archivos excluidos; no se entregará." >&2
  exit 1
fi

cat > "$OUTPUT" <<'LAUNCHER'
#!/usr/bin/env bash
# MEGANET — Instalador autocontenido para Proxmox (Ubuntu/Debian).
# Uso: sudo bash meganet-proxmox-completo.run [perfil.ovpn] [copia.sql]
set -Eeuo pipefail

ARCHIVE_LINE="$(awk '/^__MEGANET_ARCHIVE_BELOW__$/ {print NR + 1; exit 0}' "$0")"
if [[ -z "$ARCHIVE_LINE" ]]; then
  echo "El instalador está dañado: no se encontró el paquete interno." >&2
  exit 1
fi

WORK_DIR="$(mktemp -d /tmp/meganet-installer.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Extrayendo el paquete Meganet..."
PROJECT_DIR="$WORK_DIR/project"
mkdir -p "$PROJECT_DIR"
tail -n +"$ARCHIVE_LINE" "$0" | base64 -d | tar -xzf - -C "$PROJECT_DIR"

if [[ ! -f "$PROJECT_DIR/package.json" || ! -f "$PROJECT_DIR/deploy/install-proxmox-complete.sh" ]]; then
  echo "El paquete interno está incompleto." >&2
  exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
  MIGRATIONS="$(find "$PROJECT_DIR/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l)"
  bash -n "$PROJECT_DIR/deploy/install-proxmox-complete.sh"
  bash -n "$PROJECT_DIR/deploy/install-proxmox-openvpn-client.sh"
  bash -n "$PROJECT_DIR/deploy/install-meganet.sh"
  echo "Paquete correcto: código, instaladores y $MIGRATIONS migraciones incluidos."
  echo "Sintaxis de los tres instaladores verificada. No se instaló ni modificó nada."
  exit 0
fi

bash "$PROJECT_DIR/deploy/install-proxmox-complete.sh" "$@"
exit $?

__MEGANET_ARCHIVE_BELOW__
LAUNCHER

base64 "$ARCHIVE" >> "$OUTPUT"
chmod 700 "$OUTPUT"

printf 'Instalador creado: %s\n' "$OUTPUT"
printf 'Tamaño: '
numfmt --to=iec --suffix=B "$(stat -c %s "$OUTPUT")"
printf 'Archivos incluidos: '
tar -tzf "$ARCHIVE" | wc -l
printf 'SHA-256: '
sha256sum "$OUTPUT" | awk '{print $1}'
