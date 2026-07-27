# Meganet VPN — SoftEther SSTP

VPN dedicada para que el panel Meganet alcance los MikroTik de clientes
detrás de NAT. Usa **SoftEther** con listener **SSTP en puerto 443**
(compatible con RouterOS 6 y 7).

## Arquitectura

```
Panel Lovable ──► Agente MikroTik (VPS :8729) ──► SSTP tunnel :443 ──► MikroTik cliente
                        │
                        └─ Consulta al router por su IP VPN (10.10.0.x)
```

## Instalación (una sola vez, en el VPS)

```bash
sudo bash deploy/install-vpn-contabo.sh
```

Deja todo listo y guarda credenciales en `/root/meganet-vpn-credentials.txt`.

Requisitos:
- Puerto **443/tcp** libre en el VPS.
- UFW se abre automáticamente.

## Agregar un router

```bash
sudo bash deploy/vpn-add-router.sh <nombre> <ip-fija>
# Ejemplo:
sudo bash deploy/vpn-add-router.sh mercedes 10.10.0.11
```

Imprime en pantalla:
- Usuario y password para el SSTP client
- IP y puerto del VPS
- Comandos exactos para el router

Copiar esos datos en **WinBox → PPP → Interface → SSTP Client**.

## Sincronizar con el panel

Después de que el router conecte, en el panel:

1. Ir a **Red → Routers → (editar el router)**
2. Cambiar la IP a la asignada por la VPN (ej. `10.10.0.11`)
3. Guardar y probar **Test conexión** → debe pasar a **CONECTADO** verde

## Revocar un router

```bash
ADMIN_PASS="$(cat /opt/vpnserver/.admin_pass)"
/opt/vpnserver/vpncmd /server localhost:5555 /hub:MEGANET \
  /password:${ADMIN_PASS} /cmd UserDelete <nombre>
```

## Diagnóstico

- Estado del servicio: `systemctl status vpnserver`
- Logs: `journalctl -u vpnserver -n 100 --no-pager`
- Sesiones activas:
  ```bash
  ADMIN_PASS="$(cat /opt/vpnserver/.admin_pass)"
  /opt/vpnserver/vpncmd /server localhost:5555 /hub:MEGANET \
    /password:${ADMIN_PASS} /cmd SessionList
  ```
- Puerto: `sudo ss -tlnp | grep :443`

## Reinstalar desde cero

```bash
sudo bash deploy/clean-vpn-contabo.sh   # borra todo lo de VPN
sudo bash deploy/install-vpn-contabo.sh # instala de nuevo
```
