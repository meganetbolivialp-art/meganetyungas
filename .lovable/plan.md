# Plan de Reparación: Error "Failed to fetch" en Login

El error "Failed to fetch" al intentar iniciar sesión en `http://157.173.118.181/auth` indica que el frontend no puede comunicarse con la API de Supabase local. Esto sucede porque el sistema probablemente sigue intentando conectar a la IP antigua o porque la configuración de red de Supabase no se ha actualizado.

## Acciones en el VPS (Contabo)

Copia y pega este bloque en tu terminal para corregir las IPs y reconstruir el sistema:

```bash
# 1. Configurar variables
NEW_IP="157.173.118.181"
BASE_DIR="/opt/meganet-deploy"

# 2. Actualizar el archivo de configuración (.env)
if [ -f "$BASE_DIR/.env.production" ]; then
    sed -i "s|VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=http://$NEW_IP:8000|g" $BASE_DIR/.env.production
    sed -i "s|SITE_URL=.*|SITE_URL=http://$NEW_IP|g" $BASE_DIR/.env.production
    sed -i "s|API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://$NEW_IP:8000|g" $BASE_DIR/.env.production
    echo "IPs actualizadas en .env.production"
fi

# 3. Reconstruir el frontend (esto inyecta la nueva IP en el código)
cd $BASE_DIR
bun run build

# 4. Actualizar contenedores de Supabase
cd $BASE_DIR/supabase
docker compose up -d auth rest

# 5. Reiniciar el servicio web
sudo systemctl restart meganet-web
```

## Verificación
Una vez ejecutado, recarga la página en el navegador e intenta entrar con:
- **Usuario:** `admin@meganet.bo`
- **Pass:** `MeganetAdmin2026!` (o la que hayas configurado)

Si el error persiste, el comando `docker logs meganet-supabase-auth-1` nos dará la pista final.
