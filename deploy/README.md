# Migración Meganet a Contabo VPS

Un solo script hace todo: instala Docker, Supabase self-hosted (Postgres + Auth + API + Storage + Studio), Nginx con SSL Let's Encrypt, el frontend, el agente MikroTik y backups diarios.

## Uso rápido

```bash
# 1. Conéctate al VPS de Contabo
ssh root@TU_IP_CONTABO

# 2. Descarga el script
wget https://raw.githubusercontent.com/TU_USUARIO/TU_REPO/main/deploy/install-meganet.sh
# o súbelo por SCP:
# scp deploy/install-meganet.sh root@TU_IP:/root/

# 3. Ejecuta
chmod +x install-meganet.sh
sudo bash install-meganet.sh
```

El script te preguntará:
- **Dominio** (ej: `admin.tudominio.com`) o vacío para usar la IP
- **Email** para el certificado SSL
- **Admin inicial** (email + contraseña)
- **Repo Git del frontend** (opcional, si no lo tienes se sube manual)

Todo lo demás lo hace solo. Tarda **~10 minutos**.

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

## Migrar los datos de Lovable Cloud

1. En Lovable: **Cloud → Advanced settings → Export data**
2. Espera el email con el archivo
3. Súbelo al VPS:
   ```bash
   scp meganet-dump.sql root@TU_IP:/opt/meganet/backups/
   ```
4. Impórtalo:
   ```bash
   ssh root@TU_IP
   docker exec -i meganet-supabase-db-1 psql -U postgres < /opt/meganet/backups/meganet-dump.sql
   ```

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
