# Banco, Google e réplica independente

## Usar a rede existente ou criar outra

Adicionar um host à rede atual utiliza o mesmo projeto Supabase e uma autorização emitida por um host já integrado. Criar uma réplica independente exige um Supabase e um cliente OAuth próprios. Os saves não migram automaticamente de um projeto Supabase para outro.

O código não contém a senha Google, Client Secret, service-role key nem a autorização privada de produção. Os valores públicos da instância atual estão em `src/fenys-google-auth.js`; publicar URL e publishable key não concede privilégios administrativos.

## 1. Criar as estruturas em um projeto vazio

No SQL Editor do **seu novo projeto**, execute nesta ordem:

1. [`supabase/schema.sql`](../supabase/schema.sql): schema privado, ativações, realms e backups legados.
2. [`supabase/google-players.sql`](../supabase/google-players.sql): hosts, convites, jogadores e RPC do modo Google.

Os arquivos são a instalação inicial; contêm `CREATE FUNCTION` e não são um sistema de migrações reexecutável. Não os aplique novamente sobre produção esperando que atualizem tudo automaticamente. Para mudanças futuras, produza migrações explícitas e faça backup.

Mantenha `fenys_global` privado, com RLS e sem grants para `anon`/`authenticated`. As funções SQL recebem chamadas do backend usando `service_role`. Os jogadores acessam a Edge Function, não as tabelas diretamente.

## 2. Publicar a API

A função se chama **fenys-global**. Pelo editor de Edge Functions do painel Supabase, crie a função e use o conteúdo completo de [`supabase/dashboard-api.ts`](../supabase/dashboard-api.ts), que é o bundle para esse método. Outra forma é publicar `functions/fenys-global/index.ts` junto de `players.ts` com as ferramentas Supabase apropriadas.

Para essa função, desative a verificação JWT automática do gateway (`verify_jwt=false`): algumas operações são de hosts com assinatura Ed25519, sem sessão de usuário. A própria função valida assinaturas e, para operações de jogador, consulta o Supabase Auth com o token Google. **Não remova essas validações do código.** O runtime usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, disponíveis apenas no backend do projeto.

Confira `https://SEU_PROJECT_REF.supabase.co/functions/v1/fenys-global/players`: um GET deve responder `service: launcher-players` e `version: 3`. Um POST de perfil sem autorização deve retornar 401. Isso confirma apenas disponibilidade/proteção inicial, não o fluxo completo de jogo.

Fontes de implantação: [documentação de Edge Functions](https://supabase.com/docs/guides/functions/deploy). O guia utiliza o painel para não depender de uma versão específica da CLI.

## 3. Apontar sua compilação para sua nuvem

Antes de compilar o launcher e ativar os hosts, altere:

| Arquivo | Valor a configurar |
|---|---|
| `src/fenys-google-auth.js` | `URL`: URL do seu projeto; `KEY`: sua chave **publishable** |
| `src/fenys-supabase.js` | `ENDPOINT`: URL do seu projeto + `/functions/v1/fenys-global` |

`fenys-google-cloud.js` deriva o endpoint `/players` da URL de autenticação. Não coloque uma chave secreta ou `service_role` no lugar de `KEY`. Procure o identificador do projeto anterior no código executável para conferir a troca. Exemplos históricos na documentação podem continuar apontando à instância original.

Execute `npm test`, recompile os instaladores e use a mesma configuração em todos os hosts e jogadores da réplica. Para hosts já ativados, não edite apenas o endereço em produção: configurações, autorizações e snapshots pertencem ao projeto original; planeje a migração dos dados.

## 4. Ativar Google

Crie um cliente OAuth do tipo **Aplicativo da Web** no Google Auth Platform, com acesso básico `openid`, e-mail e perfil. Cadastre o retorno `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`. Configure Client ID e Client Secret no provedor Google do seu Supabase e habilite-o. Em modo de teste do Google, adicione os usuários de teste autorizados.

Na lista de URLs de retorno permitidas do Supabase, inclua `http://127.0.0.1:43967/**`, usado pelo listener local do launcher. O segredo OAuth permanece no painel Supabase, nunca no launcher.

Veja [Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google) e [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls). O funcionamento da tela de consentimento e as permissões da sua conta Google precisam ser conferidos na implantação real.

## 5. Autorizar o primeiro host

Depois de configurar os endpoints do passo 3, execute na raiz:

```bash
npm run cloud:authorization
```

O comando gera, sem imprimir segredos:

- `runtime/cloud-enrollment/authorization.json`: autorização privada do primeiro host;
- `runtime/cloud-enrollment/activation.sql`: registro do hash da ativação, válido por 24 horas após executar o SQL.

Execute `activation.sql` no SQL Editor do **mesmo projeto**. Em seguida, no launcher do dono, selecione `authorization.json` ao ativar o primeiro servidor Google. A ativação vincula o realm à identidade criptográfica desse host. Preserve o arquivo e os dados de identidade gerados, com backup privado.

Para hosts seguintes, use **Autorizar outro servidor** e o código `DLUH3` produzido pelo host integrado. Não reutilize a autorização inicial como convite de jogador. O convite do jogador é `DLU3` e tem finalidade diferente.

## 6. Verificar

Confirme o login real, vínculo do personagem antigo, reconexão ao mesmo host, mudança para um segundo host e recuperação em um perfil local novo. Confira o save antes de apagar dados antigos. Testes automatizados usam um broker isolado e não entram na sua conta Google.

O último status registrado da instância original (12/10/2026) era provedor Google desativado. Este tutorial não afirma que o OAuth já foi configurado nem altera o projeto de produção.


## 7. Hospedagem externa: VPS ou servidor da comunidade

O launcher pode rodar no PC do jogador enquanto Metagame, DeployServer e serviços de partida rodam em outro Windows (VPS ou computador de um membro da comunidade). Não é necessário manter o PC do dono original ligado **após** a migração e validação completa do host e dos dados.

### Endereços e protocolos

- **API Metagame**: use um endpoint HTTPS público com certificado válido e endereço DNS estável. A configuração de host Google aceita `networkMode=public`, `address=https://...` e certificado/chave HTTPS locais ao host.
- **Partidas**: configure o endereço IPv4 público acessível para o tráfego de jogo, separadamente da API HTTPS (`gameAddress`). O caminho de rede das partidas exige encaminhamento das portas UDP utilizadas pelo servidor, atualmente documentadas como **8770–8777**; valide também firewall, provedor e configuração efetiva do DeployServer.
- **61001**: não publique a porta de administração/DeployServer diretamente na internet. Mantenha a comunicação interna protegida.
- **Supabase**: autenticação Google, autorização do host e progresso persistente; **não** é proxy do Metagame nem relay UDP de partidas.
- **Sem Tailscale**: o cliente não precisa instalar VPN quando o host oferece conectividade pública direta. Se o host estiver atrás de CGNAT, será necessário IPv4 público, hospedagem externa ou um relay UDP específico ainda não implementado.

### Preparação de um host novo

1. Confirme permissão para hospedar os componentes do projeto e faça backup dos saves e da identidade do host atual. Não reutilize a chave privada de um host em máquinas de terceiros.
2. Provisione Windows com IP público estável, DNS, certificado HTTPS e regras de firewall específicas. Instale Node.js e os componentes do Dauntless Revived; configure Metagame, DeployServer e executável de partida.
3. Use o **mesmo projeto Supabase** e as configurações públicas do launcher para participar da mesma rede de personagens. O administrador do host já integrado emite uma **autorização de outro servidor**; o novo host usa essa autorização na ativação Google. A primeira autorização SQL é apenas para o primeiro host.
4. No host novo, selecione **Público — HTTPS**, informe a URL HTTPS da API e o IPv4 público das partidas, e selecione o certificado/chave no próprio host. Faça a ativação somente com todos os jogadores desconectados.
5. Valide: status HTTPS remoto, autenticação Google, entrada autorizada, jogo real em dois computadores fora da mesma rede, partida UDP, desconexão, sincronização e reconexão com o personagem preservado.
6. Só depois considere desligar o host antigo. Uma simples mudança de DNS não migra automaticamente identidade, estado em memória nem saves não sincronizados.

### Servidores da comunidade

Cada host terá identidade e autorização próprias. Um futuro catálogo Supabase pode registrar nome, endereço HTTPS, status e política de entrada (amigos, aberto, restrito/VIP), sem expor credenciais privadas. **Esse catálogo, os convites Google e o controle de acesso VIP ainda não estão implementados.** Não conceda acesso com base apenas na interface: o host deve validar a permissão no backend antes de entregar credenciais ou permitir partidas.

### Critérios de aceite antes de contratar hospedagem definitiva

- Dois PCs em redes diferentes entram no mesmo host público sem Tailscale.
- A API HTTPS é acessível; as partidas realmente iniciam e o UDP chega ao host.
- Nenhuma chave administrativa, chave privada TLS ou `service_role` é incluída no launcher.
- A troca de host mantém identidade e progresso sem sobrescrever saves existentes.
- Um usuário sem permissão é recusado pelo servidor, não apenas por um botão desabilitado.

