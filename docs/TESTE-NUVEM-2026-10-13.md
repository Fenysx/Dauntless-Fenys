# Verificação da nuvem de personagens — 13/10/2026

## Escopo e resultado

Teste executado no projeto Supabase conectado ao **Dauntless Launcher Ultimate**, usando **dados inteiramente fictícios**, duas identidades de host provisórias e uma conta de autenticação provisória **sem login Google**.

A chamada a `public.launcher_google_api(operation, args)` ocorreu diretamente no banco (nível SQL), de forma controlada. Isso verifica a persistência, a consulta e as regras transacionais do banco real, **mas não testa o JWT/consentimento Google, a assinatura Ed25519 na Edge Function, um cliente Dauntless aberto ou dois Metagames em execução**.

| Etapa | Resultado |
| --- | --- |
| Criar conta de teste isolada e dois hosts de teste | OK |
| Vincular personagem fictício à identidade simulada | OK |
| Salvar nível 28, XP 5600, 1250 Rams e 12 poções | OK |
| Consultar a tabela em outra chamada e obter o mesmo progresso | OK |
| Abrir sessão no host A e carregar o personagem | OK |
| Recusar host B enquanto host A mantém lease ativo (`character_busy`) | OK |
| Atualizar no host A para nível 35, XP 9800, 2450 Rams e 17 poções | OK |
| Confirmar revisão 2 e ler novamente os dados na nuvem | OK |
| Recusar save baseado na revisão antiga (`stale_progress`) | OK |
| Liberar host A e conectar host B com o mesmo UID, nível e inventário | OK |
| Recusar save do host A após a troca (`session_expired`) | OK |
| Excluir conta, personagem, hosts e realm provisórios | OK — todos 0 restantes |

**Estado final confirmado:** permaneceu **1 host Google preexistente** e **0 personagens Google reais** na tabela do projeto. O teste não modificou dados de outros aplicativos compartilhando o mesmo banco, nem arquivos locais de saves.

## Por que os registros foram excluídos

Este foi um teste de gravação e recuperação em **produção**, e não um cadastro real com OAuth. Uma conta inserida diretamente no banco, sem identidade Google de provedor, não deve permanecer como jogador. Os dois hosts de teste também não representam servidores válidos e não possuem uma assinatura Ed25519 real. Os registros foram eliminados após validação e a contagem final foi conferida.

Os snapshots de teste continham `schema = dlu-test-fixture-not-native`: intencionalmente **não devem ser importados em um Metagame real**. Portanto, o teste NÃO valida a compatibilidade do snapshot com a instalação Dauntless 1.4.4.

## Próxima validação obrigatória antes de confiar saves reais

1. Abrir a versão recente do launcher no Windows, entrar com Google verdadeiro e verificar o provider ativo no Supabase.
2. Subir o Metagame local com a integração Google realmente ativa (rotas `/launcher/google/status`, `/launcher/google/link`, `/launcher/google/join`, `/launcher/google/sync-now`).
3. Com o jogo fechado e backup local conferido, vincular o personagem preexistente e confirmar `google_players.linked`, UID e revisão maior que zero.
4. Jogar, sair e conferir o incremento da revisão e os itens/XP no banco; não apagar nem substituir saves locais.
5. Testar recuperação no mesmo Google em outro PC e troca para host externo autorizado, validando identidade do host, sessão única e sincronização pós-caçada.

## Referências do código

- [API SQL de progresso](../supabase/google-players.sql)
- [Edge Function de personagens](../supabase/functions/fenys-global/players.ts)
- [Cliente de personagem Google](../src/fenys-google-player.js)
- [Testes locais com dois Metagames](../test/integration-google.cjs)
- [Diagnóstico do servidor local](DIAGNOSTICO-RAMSGATE.md)
