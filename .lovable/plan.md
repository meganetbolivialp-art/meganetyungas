# Plano de Recuperação: Erro 502 Bad Gateway

O usuário está enfrentando um erro **502 Bad Gateway** ao tentar acessar o painel na nova IP `157.173.118.181`. Isso geralmente indica que o Nginx está rodando, mas não consegue se comunicar com o serviço backend (`meganet-web`).

## Diagnóstico Provável
1. **Serviço Parado:** O serviço `meganet-web` pode ter falhado ao iniciar (vimos anteriormente erros de porta ocupada ou falta de `.env`).
2. **Porta Incorreta:** O Nginx espera o serviço na porta 3000, mas o serviço pode estar tentando subir em outra ou falhando antes de abrir a porta.
3. **Loopback Issue:** O Nginx está configurado para `proxy_pass http://127.0.0.1:3000`, mas o serviço pode estar ouvindo apenas em `localhost` (IPv6) ou vice-versa em algumas configurações de VPS.

## Plano de Ação

### 1. Script de Diagnóstico e Reparo Imediato
Vou preparar um comando único que o usuário deve executar para identificar o culpado e tentar uma correção automática.

### 2. Ajustes no Código do Projeto
- Atualizar `deploy/repair-web.sh` para ser ainda mais resiliente com a detecção de IP e limpeza de portas.
- Garantir que a configuração do Nginx no instalador use `127.0.0.1` de forma consistente para evitar problemas de resolução de `localhost`.

## Execução sugerida para o usuário:

```bash
# 1. Verificar se o serviço está rodando e por que falhou
sudo systemctl status meganet-web --no-pager
sudo journalctl -u meganet-web -n 50 --no-pager

# 2. Verificar se algo está ouvindo na porta 3000
sudo ss -tulpn | grep :3000

# 3. Forçar reinicialização limpa (limpa portas presas)
sudo fuser -k 3000/tcp || true
sudo systemctl restart meganet-web

# 4. Verificar logs do Nginx para confirmar o erro de upstream
sudo tail -n 20 /var/log/nginx/error.log
```

Se o serviço `meganet-web` mostrar "Active: failed", o problema é a aplicação. Se mostrar "Active: running" mas o 502 persistir, o problema é a ponte Nginx -> App.
