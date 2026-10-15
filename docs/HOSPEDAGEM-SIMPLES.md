# Hospedagem básica — Dauntless Launcher Ultimate 1.8.0-beta.8

## Objetivo

**Ligar o servidor e jogar sem cadastro adicional nem ajustes de rede.** A conta Google, o Supabase e a publicação da comunidade são opcionais para esse uso.

## Na tela Hospedar servidor

A tela principal mostra apenas:

- Estado atual do Metagame e DeployServer
- **Ligar meu servidor** — inicia os serviços locais pelo launcher; se já estiverem ligados, a tela informa isso
- **Jogar agora** — abre o jogo usando o servidor selecionado no launcher
- **Desligar** — encerra apenas processos que o próprio launcher iniciou
- **Diagnóstico e arquivos do servidor** — fechado por padrão, para investigação de erros
- **Convidar amigos ou publicar um servidor** — fechado por padrão, dedicado à integração Google e internet

A tela **Visão geral** não mostra mais botões repetidos para iniciar/parar/reiniciar. A antiga **Central do servidor**, que duplicava os controles, foi removida. Use **Visão geral → Abrir meu servidor** para chegar à administração.

## O que significa “servidor ligado”?

Significa que **Metagame TCP 61000** e **DeployServer TCP 61001** responderam. **Não confirma** que o executável nativo de Ramsgate iniciou nas portas UDP de jogo, que uma caçada pode ser concluída, nem que outro computador consiga entrar.

O launcher mostrará um aviso curto se houver pouca RAM livre; isso não bloqueia iniciar os serviços Node. Se Ramsgate falhar, feche aplicativos pesados e execute o diagnóstico avançado. O teste de um jogo real continua obrigatório.

## Se quero convidar Ygor

Abra a área opcional **Convidar amigos ou publicar um servidor**. A detecção de IP local já está implementada. O host Google precisa ser ativado no servidor de origem antes de vincular o personagem; em outra casa, além do Google, é necessária conectividade HTTPS e transporte UDP via endereço público encaminhado ou relay compatível. Um IP de saída detectado por STUN **não garante acesso externo**.

Não publique TCP 61001, não envie ao amigo o arquivo privado `authorization.json` e não crie um personagem novo para contornar a ausência da rota `/launcher/google/status`.

A versão beta.8 **não provisiona VPN/relay UDP automaticamente**. Essa infraestrutura e o teste com dois computadores continuam pendentes.

## Identificar a versão realmente instalada

Na barra lateral, o aplicativo novo mostra **VERSÃO INSTALADA • v1.8.0-beta.8**. Se ainda aparecer a interface com “PASSO 1 / PASSO 2 / PASSO 3”, o instalador atualizado ainda não substituiu o executável aberto no PC.

## Segurança de dados

A atualização do launcher não deve apagar `undaunted.db`, `account.key`, chaves privadas, configurações da conta Google nem tokens. A opção **Limpar preferências antigas de conexão** fica na parte avançada; cria backup das configurações antes de modificar somente os campos antigos reconhecidos. A migração/sincronização do personagem é outro fluxo, e requer backup e validação explícita.

Mais detalhes em [Conexão automática](CONEXAO-AUTOMATICA.md) e [Diagnóstico da Ramsgate](DIAGNOSTICO-RAMSGATE.md).
