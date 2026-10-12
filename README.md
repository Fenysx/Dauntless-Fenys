# Dauntless Launcher Lite — protótipo v0.1

Launcher local, independente, em português, para Windows. **Não é um jogo completo e não distribui arquivos de Dauntless.**

## Requisitos
- Windows 11, Node.js 24 e npm
- Cópia local já configurada de `dauntless-revived`
- `UndauntedMetagame/dist/server.js` e `UndauntedDeployServer/dist/server.js` compilados
- Arquivo `.env` local em cada serviço (não publicar)
- Launcher atual instalado e funcionando (fase inicial)

## Iniciar
No terminal, dentro da pasta deste projeto:

```bash
npm install
npm start
```

Em **Configurações**, selecione a pasta `dauntless-revived` e o executável do launcher atual. Clique em **JOGAR**. O app verifica as portas 61000 e 61001, inicia serviços ausentes e espera até 35 segundos antes de abrir o launcher atual.

## Limites conhecidos da v0.1
- Este é um **protótipo de código-fonte não testado no PC do usuário**, não um instalador pronto.
- O jogo ainda é iniciado **pelo launcher antigo**; iniciar diretamente o cliente exige validar argumentos, autenticação e compatibilidade.
- As portas abertas indicam conectividade TCP, **não garantem** que o serviço ou a partida estejam saudáveis.
- O app não configura automaticamente o GameServer nem corrige problemas de RAM/matchmaking.
- Ao fechar o app, tenta encerrar somente os processos Node que ele iniciou; processos filhos do DeployServer podem requerer encerramento próprio.
- Não publica atualizações automáticas, não pede credenciais e não envia telemetria.

## Próximas fases
1. Validar a execução local, logs e fluxo de inicialização.
2. Descobrir integração direta e autorizada com cliente compatível, removendo dependência do launcher antigo.
3. Adicionar monitoramento de GameServer e diagnósticos detalhados.
4. Criar instalador Windows e atualização assinada, após auditoria de segurança.

## Licença e créditos
Este scaffold foi criado separadamente. Ao incorporar ou derivar código do repositório `mixutin/dauntless-revived`, respeitar `AGPL-3.0-only`, manter `LICENSE.txt`, `NOTICE.md`, histórico e créditos pertinentes. **Não** enviar `.env`, chaves, bancos de dados ou arquivos proprietários do jogo.
