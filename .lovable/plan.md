## Objetivo

Instalar de cero un servidor VPN **SSTP con SoftEther** en el VPS Contabo (`157.173.118.181`) y dejar el router **MERCEDES** conectado al panel de forma estable.

## Estado actual

- El script `deploy/clean-vpn-contabo.sh` ya borró SoftEther y configs de VPN previas.
- El agente MikroTik en el VPS quedó **funcionando** en puerto `8729` (UFW abierto).
- Router MERCEDES: MikroTik hEX S, RouterOS 6, sin túnel activo.
- El panel apunta al agente vía `MIKROTIK_AGENT_HOST/PORT` (ya configurados).

## Fases

### Fase 1 — Instalar SoftEther en el VPS

Script `deploy/install-vpn-contabo.sh` que:

1. Instala dependencias (`build-essential`, `gcc`, `make`, `libssl-dev`).
2. Descarga y compila **SoftEther VPN Server** estable en `/opt/vpnserver`.
3. Crea servicio `systemd` `vpnserver` con restart automático.
4. Configura vía `vpncmd`:
   - Password de admin del server (secret).
   - Hub `MEGANET` con password propio.
   - Habilita listener **SSTP en 443** (además del 5555 nativo).
   - Crea **pool DHCP interno** `10.10.0.0/24` con gateway `10.10.0.1`.
   - Habilita **SecureNAT** para dar internet salida a los routers si lo necesitan.
5. Abre puerto `443/tcp` en UFW (SSTP) y guarda el estado.
6. Imprime al final: IP del server, hub, y comando para crear usuarios.

### Fase 2 — Provisionar usuario para MERCEDES

Script `deploy/vpn-add-router.sh <nombre> <password>` que:

1. Crea usuario en el hub `MEGANET` con auth por password.
2. Registra el usuario en la tabla `vpn_peers` del panel con la IP fija que le va a asignar SoftEther (reserva manual dentro del pool, ej. `10.10.0.11` para MERCEDES).
3. Devuelve las credenciales listas para pegar en WinBox.

### Fase 3 — Actualizar MERCEDES

En WinBox del router:
- Borrar la interface `vpn-panel` vieja.
- Crear nueva SSTP Client con:
  - `Connect To: 157.173.118.181`
  - `Port: 443`
  - `User: mercedes` / `Password: <nuevo>`
- Agregar `/ip address add address=10.10.0.11/24 interface=vpn-panel`.
- Verificar con `/ping 10.10.0.1` desde el router.

### Fase 4 — Sincronizar panel

- Actualizar `routers.ip_address` de MERCEDES a `10.10.0.11`.
- Test conexión desde el panel → agente prueba `10.10.0.11:8728` a través del túnel.
- Confirmar estado **CONECTADO** verde.

### Fase 5 — Documentar

- README corto en `deploy/README-vpn.md` con: cómo instalar, cómo agregar router nuevo, cómo revocar.
- Cómo generar `.rsc` desde el panel apuntando a esta VPN (ya existe el generador, sólo verificar host/port).

## Detalles técnicos

- **SoftEther vs OpenVPN**: SoftEther elegido porque soporta SSTP nativo compatible con RouterOS 6 sin certificados clientes complicados, y ya lo veníamos usando.
- **Pool `10.10.0.0/24`**: rango dedicado que no choca con LANs de clientes (`192.168.x.x`).
- **IPs fijas por router**: usamos `SecurePolicy` de SoftEther para forzar IP por usuario, así el panel no tiene que descubrirla dinámicamente.
- **Puerto 443**: se abre en UFW y en el listener SSTP del server. No colisiona con nada más en el VPS.
- **Password del hub**: se guarda como secret `VPN_HUB_PASSWORD` para que scripts futuros puedan crear usuarios sin intervención.

## Riesgos

- Si algo del panel web del VPS (`157.173.118.181:3000`) usa el 443, hay que moverlo antes. Verifico con `ss -tlnp | grep :443` como primer paso del install.
- Compilar SoftEther tarda ~2–3 min en un VPS chico.

## Confirmación

¿Arranco con el script de instalación (Fase 1) y el de provisión (Fase 2), o querés que revisemos algo antes?
