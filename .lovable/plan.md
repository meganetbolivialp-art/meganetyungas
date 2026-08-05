# Plan: Solución de Error de Conexión en el VPS

El usuario reporta que no puede acceder a `144.91.78.4` (ERR_CONNECTION_REFUSED). Esto indica que el servidor no está aceptando conexiones en el puerto 80/443, o que los servicios (Nginx/Meganet-Web) no han iniciado correctamente tras la instalación.

## Diagnóstico
1. **Verificación de Puertos:** Es posible que Nginx no esté escuchando o que `ufw` esté bloqueando el tráfico a pesar de los scripts.
2. **Estado de los Servicios:**
   - `nginx.service`: Debe estar activo para servir como proxy.
   - `meganet-web.service`: Debe estar activo (Node.js en puerto 3000).
   - `docker` (Supabase): Los contenedores deben estar corriendo (Kong en 8000).
3. **Fallas en la Instalación:** El script `install-meganet.sh` pudo haber fallado en el paso de Nginx o Certbot (SSL).

## Pasos para el Usuario (Comandos en el VPS)
Ejecutar estos comandos en el VPS para identificar el cuello de botella:

```bash
# 1. Verificar si los servicios están corriendo
sudo systemctl status nginx --no-pager
sudo systemctl status meganet-web --no-pager
sudo docker ps --format "table {{.Names}}\t{{.Status}}"

# 2. Verificar puertos abiertos localmente
sudo ss -tulpn | grep -E ':80|:443|:3000|:8000'

# 3. Revisar logs de error de Nginx si no arranca
sudo nginx -t
sudo journalctl -u nginx -n 20 --no-pager

# 4. Asegurar que el firewall permite el tráfico
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

## Acciones en el Proyecto
- **Habilitar HTTP por defecto:** Si el usuario no configuró un dominio, el sistema intentará forzar HTTPS si Certbot se ejecutó. Aseguraré que `install-meganet.sh` y la configuración de Nginx sean robustas para acceso por IP directa.
- **Script de Autodiagnóstico:** Crear un script `deploy/check-vps-health.sh` que el usuario pueda correr para ver un reporte de qué falló.

## Preguntas para el Usuario
1. ¿Viste algún mensaje de error rojo durante la ejecución de `sudo bash /opt/meganet-deploy/deploy/install-meganet.sh`?
2. ¿Estás usando un dominio real o solo la IP `144.91.78.4`?
3. ¿Podrías enviarme el resultado del comando `sudo systemctl status nginx`?
