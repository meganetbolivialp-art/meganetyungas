# Migración Meganet a Contabo VPS

Un solo script hace todo: instala Docker, Supabase self-hosted (Postgres + Auth + API + Storage + Studio), Nginx con SSL Let's Encrypt, el frontend, el agente MikroTik y backups diarios.

## Uso rápido (1 comando en VPS limpio)

> ⚠️ El repo `meganetbolivialp-art/control-shine-hub` es **privado**, así que
> `curl https://raw.githubusercontent.com/...` devuelve **404**. Usá uno de
> estos 3 métodos:

### Método A — SCP (recomendado, sin GitHub)

```bash
# Desde tu PC, en la carpeta del proyecto:
scp deploy/install-full.sh root@TU_IP:/root/
scp meganet-dump.sql        root@TU_IP:/root/   # opcional

# En el VPS, subí el código con rsync (evita clonar de GitHub):
rsync -az --exclude node_modules --exclude .git ./ root@TU_IP:/opt/meganet/

# Ejecutá el instalador
ssh root@TU_IP
sudo GIT_REPO="" DUMP_SQL=/root/meganet-dump.sql bash /root/install-full.sh
```

Con `GIT_REPO=""` el script omite el clone y usa el código ya subido en
`/opt/meganet`.

### Método B — Con Personal Access Token

```bash
export GH_TOKEN=ghp_xxxxxxxxxxxx   # PAT con scope 'repo'
curl -fsSL -H "Authorization: token $GH_TOKEN" \
  https://raw.githubusercontent.com/meganetbolivialp-art/control-shine-hub/main/deploy/install-full.sh \
  | sudo -E GIT_REPO="https://$GH_TOKEN@github.com/meganetbolivialp-art/control-shine-hub.git" bash
```

### Método C — Hacer el repo público

En GitHub → Settings → Danger Zone → Change visibility → Public. Después:

```bash
curl -fsSL https://raw.githubusercontent.com/meganetbolivialp-art/control-shine-hub/main/deploy/install-full.sh | sudo bash
```

El script pregunta: dominio (o vacío para IP), email SSL, admin inicial,
dump SQL (opcional) y si instalar la VPN SoftEther. Tarda ~10 min.

## Qué instala

| Componente | Puerto | Rol |
|---|---|---|
| PostgreSQL 15 | 5432 | Base de datos |
| GoTrue (Auth) | interno | Autenticación |
| PostgREST | interno | API REST |
| Realtime | interno | Websockets |
| Storage | interno | Archivos |
| Studio | interno via `/studio/` | Admin DB (usuario `admin`) |
| Kong Gateway | 8000 | Puerta única a Supabase |
| Frontend | 3000 | Panel Meganet |
| Nginx | 80/443 | Proxy + SSL |
| MikroTik Agent | 8777 | Puente a routers |

## Migrar los datos de Lovable Cloud (automático)

1. En Lovable: **Cloud → Advanced settings → Export data**
2. Espera el email con el archivo `.sql`
3. Desde tu PC ejecuta el script automático:
   ```bash
   bash deploy/migrate-from-lovable.sh meganet-dump.sql root@TU_IP_CONTABO
   ```
   El script hace backup previo, limpia el SQL, importa y reinicia servicios solo.
4. Para más detalles lee [`deploy/MIGRACION.md`](./MIGRACION.md).

## Después de instalar

Todas las credenciales quedan en **`/opt/meganet/CREDENCIALES.txt`** (permisos 600, solo root).

Cámbialas al frontend en las variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Comandos útiles

```bash
# Ver logs Supabase
cd /opt/meganet/supabase && docker compose logs -f

# Reiniciar
cd /opt/meganet/supabase && docker compose restart

# Backup manual
/etc/cron.daily/meganet-backup

# Ver estado agente MikroTik
systemctl status mikrotik-agent
```

## Limpiar VPN del VPS para reinstalar

Si la VPN quedó mal configurada, puedes limpiar solo VPN sin tocar Meganet, la base de datos, el frontend ni los backups:

```bash
ssh root@TU_IP_CONTABO
bash /opt/meganet/deploy/clean-vpn-contabo.sh
```

Si subiste el script manualmente:

```bash
chmod +x clean-vpn-contabo.sh
sudo bash clean-vpn-contabo.sh
```

El script respalda la configuración vieja en `/root/vpn-clean-backup-FECHA/` y elimina SoftEther/WireGuard/L2TP para reinstalar SSTP limpio.

## Backups

Diarios automáticos a `/opt/meganet/backups/db-YYYY-MM-DD.sql.gz` (retención 14 días).
