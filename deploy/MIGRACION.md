# Migración de Lovable Cloud al VPS propio

Esta guía explica cómo sacar un backup de la base de datos de **Lovable Cloud** y restaurarlo en tu **VPS Contabo** para que el sistema funcione con todos los datos.

> ⚠️ **Importante:** no podemos hacer clic automáticamente en la UI de Lovable Cloud, pero sí automatizamos todo lo demás: subir el archivo, limpiar el SQL, importar y verificar.

---

## Paso 1 — Exportar el backup desde Lovable Cloud

1. Entra al proyecto en Lovable.
2. Ve a **Cloud → Advanced settings → Export data**.
3. Espera el correo con el archivo `.sql` (puede tardar varios minutos).
4. Descárgalo a tu PC. Por ejemplo: `meganet-dump.sql`.

---

## Paso 2 — Migrar automáticamente al VPS (1 comando)

Desde tu PC, con el archivo del backup a mano, ejecuta:

```bash
bash deploy/migrate-from-lovable.sh meganet-dump.sql root@TU_IP_CONTABO
```

Esto hace todo solo:

1. **Sube el dump** al VPS.
2. **Hace un backup de seguridad** de la base actual del VPS.
3. **Limpia el SQL** de roles y comandos que solo funcionan en Lovable Cloud.
4. **Importa la base de datos** en el contenedor Postgres del VPS.
5. **Reinicia los servicios** de Supabase self-hosted.
6. **Verifica** que las tablas estén correctas.

Si algo sale mal, el script te indica cómo restaurar el backup anterior.

---

## Paso 3 — Actualizar el frontend con los datos del VPS

Después de importar, edita el archivo de variables del frontend (`.env` o `src/integrations/supabase/client.ts` si está hardcodeado) con los datos del VPS:

```bash
VITE_SUPABASE_URL=https://admin.tudominio.com
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> La clave publicable del VPS la encuentras en `/opt/meganet/CREDENCIALES.txt` en el VPS.

---

## Restaurar el backup anterior si algo falla

Si la importación no quedó bien, restaura el backup automático que hizo el script:

```bash
ssh root@TU_IP_CONTABO
gunzip -c /opt/meganet/backups/pre-import-XXXXXX.sql.gz | docker exec -i meganet-supabase-db-1 psql -U postgres
```

---

## Preguntas frecuentes

### ¿Se puede hacer 100% automático sin bajar el archivo a mi PC?

No del todo. Lovable Cloud requiere que el usuario solicite la exportación desde la UI. Lo que sí automatizamos es todo lo que ocurre después: subir, limpiar e importar.

### ¿Se pierden los usuarios/contraseñas?

No. La tabla `auth.users` viene en el dump, por lo que los usuarios, roles y contraseñas se migran.

### ¿Y las fotos/archivos de Storage?

El SQL migra metadatos. Si tienes archivos en Storage, debes migrarlos por separado. Actualmente el proyecto no tiene buckets de Storage, así que no debería ser necesario.

### ¿Funciona con el dump comprimido (.gz)?

Sí. El script detecta si el archivo termina en `.gz` y lo descomprime antes de importar.
