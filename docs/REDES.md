# Redes do Dauntless Launcher Ultimate

Os modos oferecidos pela interface atual são **rede local (LAN)** e **Internet / HTTPS**. Jogadores escolhem Servidor local ou Servidores da comunidade; não precisam instalar Tailscale nem digitar IP para entrar no catálogo.

| Modo | Indicado para | Exigência |
|---|---|---|
| Servidor local | Jogar no próprio PC | Metagame e DeployServer locais funcionando |
| LAN | Jogar entre computadores da mesma rede confiável | IPv4 LAN do host e acesso às portas exigidas |
| Internet / HTTPS | Amigos em outras redes e servidores comunitários | HTTPS/certificado válidos, host registrado no Google e IPv4 UDP alcançável |

## Segurança da hospedagem

- Metagame local: porta TCP **61000**, com acesso privado/loopback. No modo público, use o listener HTTPS autenticado que o launcher instala; não exponha o protocolo HTTP administrativo diretamente.
- DeployServer: porta TCP **61001**. **Nunca exponha à internet**, porque é um componente administrativo.
- Chat pode usar porta 61099; o modo HTTPS usa a ponte apropriada. Verifique a configuração real do host.
- Partidas: portas **UDP 8770–8777**, conforme a instalação do Dauntless Revived e a configuração dos processos nativos.
- Não publique `.env`, banco SQLite, credenciais Google, chaves nativas ou certificados privados no GitHub.

Hosts atrás de CGNAT podem precisar de VPS/encaminhamento compatível. O Supabase armazena identidade, permissões e progresso; ele **não transporta UDP** nem substitui os processos que simulam Ramsgate e caçadas.

## Configuração do host

Na aba **Hospedar servidor**, selecione LAN para começar, usando um IPv4 sugerido para este PC, ou Internet/HTTPS com o endereço e certificado válidos. Desligue o jogo antes de migrar o servidor, preserve o banco original e execute os testes de rede e salvamento após a ativação.

## Modos antigos

Não existem botões do Tailscale ou configuração de servidores clássicos no launcher novo. Parte das rotinas de rede permanece nas bibliotecas de **compatibilidade** porque pode ser necessária para recuperar instalações antigas e para o overlay do Metagame. A UI nova não instala nem exige VPN. Veja [Limpeza](LIMPEZA-2026-10-14.md).
