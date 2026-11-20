#!/usr/bin/env bash
# Arma un único archivo .run con el código actual para ACTUALIZAR una instalación
# existente sin tocar los datos. Uso: bash deploy/build-update-package.sh [salida]
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-/mnt/documents/meganet-actualizacion-v40.run}"
WORK_DIR="$(mktemp -d /tmp/meganet-update.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

ARCHIVE="$WORK_DIR/meganet-source.tar.gz"
mkdir -p "$(dirname "$OUTPUT")"

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

if tar -tzf "$ARCHIVE" | grep -E '(^|/)(\.git|\.env|node_modules|\.output)(/|$)|\.tsbuildinfo$' >/dev/null; then
  echo "El paquete contiene archivos excluidos; no se entregará." >&2
  exit 1
fi

cat > "$OUTPUT" <<'LAUNCHER'
#!/usr/bin/env bash
# MEGANET — Actualización en caliente. No borra la base de datos.
# Uso: sudo bash meganet-actualizacion-v40.run
set -Eeuo pipefail

ARCHIVE_LINE="$(awk '/^__MEGANET_ARCHIVE_BELOW__$/ {print NR + 1; exit 0}' "$0")"
[[ -n "$ARCHIVE_LINE" ]] || { echo "El archivo está dañado." >&2; exit 1; }

WORK_DIR="$(mktemp -d /tmp/meganet-update-installer.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Extrayendo la actualización..."
PROJECT_DIR="$WORK_DIR/project"
mkdir -p "$PROJECT_DIR"
tail -n +"$ARCHIVE_LINE" "$0" | base64 -d | tar -xzf - -C "$PROJECT_DIR"

[[ -f "$PROJECT_DIR/package.json" ]] || { echo "Paquete incompleto." >&2; exit 1; }
[[ -f "$PROJECT_DIR/deploy/update-meganet.sh" ]] || { echo "Paquete incompleto." >&2; exit 1; }

if [[ "${1:-}" == "--check" ]]; then
  MIGRATIONS="$(find "$PROJECT_DIR/supabase/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l)"
  bash -n "$PROJECT_DIR/deploy/update-meganet.sh"
  echo "Paquete correcto: código, instalador y $MIGRATIONS migraciones incluidos."
  echo "Sintaxis verificada. No se actualizó nada."
  exit 0
fi

bash "$PROJECT_DIR/deploy/update-meganet.sh" "$@"
exit $?

__MEGANET_ARCHIVE_BELOW__
LAUNCHER

base64 "$ARCHIVE" >> "$OUTPUT"
chmod 700 "$OUTPUT"

printf 'Actualizador creado: %s\n' "$OUTPUT"
printf 'Tamaño: '
numfmt --to=iec --suffix=B "$(stat -c %s "$OUTPUT")"
printf 'Archivos incluidos: '
tar -tzf "$ARCHIVE" | wc -l
printf 'SHA-256: '
sha256sum "$OUTPUT" | awk '{print $1}'
