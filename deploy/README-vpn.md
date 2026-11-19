# Meganet — OpenVPN con Pritunl y Proxmox

El panel se instala en una VM Ubuntu/Debian de Proxmox. La VM y cada MikroTik se conectan como **clientes independientes** al servidor Pritunl/OpenVPN ya existente; no se instala otro servidor VPN en Proxmox.

## Instalación completa con un solo archivo

En una VM limpia Ubuntu 22.04/24.04 o Debian 12, sube `meganet-proxmox-completo.run` y el perfil `.ovpn` de Pritunl a `/root`. Después ejecuta:

```bash
cd /root
sudo bash meganet-proxmox-completo.run
```

El instalador detecta el perfil automáticamente e instala OpenVPN, Docker, la base de datos, el panel, Nginx y el agente MikroTik. No necesita GitHub ni tokens. Si no encuentra `/root/meganet-dump.sql`, crea una base nueva con todas las tablas. Para indicar el perfil y una copia de datos manualmente:

```bash
sudo bash meganet-proxmox-completo.run /root/MEGANET-PROXMOX.ovpn /root/meganet-dump.sql
```

Al finalizar, las credenciales quedan en `/opt/meganet/CREDENCIALES.txt` con permisos de solo lectura para root.

## Arquitectura

```text
Panel / agente en VM Proxmox
          │ cliente OpenVPN
          ▼
Servidor Pritunl existente
          ▲
          │ cliente OpenVPN (RouterOS v7, TCP)
      MikroTik — API 8728
```

El panel consulta cada MikroTik por su IP privada VPN. La API 8728 no debe exponerse a Internet.

## 1. Crear los perfiles en Pritunl

1. Crea un usuario/perfil distinto para la VM, por ejemplo `MEGANET-PROXMOX`.
2. Crea un perfil distinto para cada MikroTik, por ejemplo `VPN-MERCEDES`.
3. No compartas el mismo perfil entre equipos.
4. Habilita la comunicación entre clientes en el servidor Pritunl y comprueba que no haya reglas que aíslen la VM de los routers.
5. Anota la IP VPN que Pritunl asigna a cada equipo. Por ejemplo, un router puede recibir `10.10.84.2`.

Para MikroTik RouterOS v7, el servidor/perfil debe ser compatible con **OpenVPN sobre TCP**, certificados y algoritmos admitidos por RouterOS. Los perfiles que ya aparecen conectados no necesitan cambios.

## 2. Conectar la VM de Proxmox

Descarga de Pritunl el perfil `.ovpn` de `MEGANET-PROXMOX`, súbelo a `/root` en la VM y ejecuta:

```bash
sudo bash /opt/meganet-deploy/deploy/install-proxmox-openvpn-client.sh
```

El instalador busca automáticamente el perfil `.ovpn`; si encuentra varios, te permite elegir el correspondiente a la VM. También puedes indicar la ruta manualmente:

```bash
sudo bash /opt/meganet-deploy/deploy/install-proxmox-openvpn-client.sh /root/MEGANET-PROXMOX.ovpn
```

El script instala el perfil en `/etc/openvpn/client/meganet.conf` y crea el inicio automático con `openvpn-client@meganet.service`.

Comprueba la conexión:

```bash
systemctl status openvpn-client@meganet --no-pager
ip -4 address show
journalctl -u openvpn-client@meganet -n 60 --no-pager
```

## 3. Conectar cada MikroTik

Usa el perfil OpenVPN correspondiente al router. En RouterOS v7:

1. Importa el certificado CA, el certificado del cliente y su clave en **System → Certificates**.
2. Configura **PPP → Interface → OVPN Client** con el servidor Pritunl, puerto, TCP y certificado del router.
3. Comprueba que la interfaz aparezca en estado `R` (running) y que tenga IP VPN.
4. Habilita la API y permite acceso únicamente desde la interfaz VPN:

```routeros
/ip service set api disabled=no port=8728
/ip firewall filter add chain=input action=accept protocol=tcp dst-port=8728 in-interface=ovpn-panel comment="mikrosystem-api" place-before=0
```

Si tu interfaz tiene otro nombre, reemplaza `ovpn-panel` por ese nombre.

## 4. Registrar el router en el panel

1. Abre **Configuración → Routers/NAS → Nuevo**.
2. Escribe la **IP VPN asignada por Pritunl**, no la IP pública ni la IP LAN del router.
3. Usa puerto **8728**, un usuario API exclusivo del panel y desactiva **Modo simulado**.
4. Guarda y pulsa **Probar conexión**.

Desde la VM también puedes comprobar la ruta y el puerto:

```bash
ping -c 4 10.10.84.2
nc -vz 10.10.84.2 8728
```

Sustituye `10.10.84.2` por la IP real del MikroTik.

## 5. Cortes y activaciones

Cuando el router aparece **ONLINE**, el panel puede importar usuarios PPPoE, crear secretos, aplicar perfiles, suspender clientes y reactivarlos. Si el túnel se cae, las operaciones compatibles quedan en cola y se aplican al recuperar la conexión.

## Diagnóstico rápido

- VM sin IP `tun`: revisa `journalctl -u openvpn-client@meganet`.
- VM con VPN pero sin ping al router: revisa client-to-client y rutas en Pritunl.
- Ping correcto pero puerto cerrado: revisa `/ip service print` y el firewall del MikroTik.
- Router conectado en Pritunl pero desconectado en el panel: comprueba que la IP registrada sea exactamente su IP VPN.
