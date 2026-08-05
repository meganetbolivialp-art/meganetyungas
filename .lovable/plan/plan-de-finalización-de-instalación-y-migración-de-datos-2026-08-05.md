# Plan de Finalización de Instalación y Migración de Datos

El sistema Meganet ha sido instalado exitosamente en el VPS. Ahora debemos completar la migración de datos desde Lovable Cloud y actualizar la memoria del proyecto con las credenciales finales.

## 1. Actualización de Memoria
- Actualizar `mem://reference/vps-reinstall` con las credenciales de producción generadas (`admin@meganet.bo` / `MeganetAdmin2026!`).
- Registrar la dirección IPv6 del panel como el endpoint oficial de producción.

## 2. Guía de Migración de Datos
Proporcionar al usuario los pasos exactos para mover sus datos actuales (clientes, servicios, configuraciones) al nuevo VPS:
1. **Exportación:** Ir a Lovable Cloud -> Advanced -> Export data.
2. **Transferencia:** Subir el archivo `meganet-dump.sql` al VPS en `/opt/meganet/backups/`.
3. **Importación:** Ejecutar el comando psql dentro del contenedor de base de datos.

## 3. Verificación de Servicios
- Confirmar que el agente MikroTik y el servidor L2TP están operativos en la nueva dirección.
- Verificar el acceso al panel en la dirección proporcionada.

## 4. Limpieza
- Asegurar que no queden referencias a credenciales temporales o tokens expuestos en la documentación interna.
