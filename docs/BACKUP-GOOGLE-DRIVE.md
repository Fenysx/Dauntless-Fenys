# Backup criptografado Google Drive — migração do OAuth compartilhado do rclone

## Por que aparece o NOTICE

```text
dauntless-drive: This remote uses rclone's shared Google Drive client_id,
which is being retired and will stop working during 2026.
```

É um **aviso de autenticação futura**, não a confirmação de falha do backup. Para saber se o envio terminou, procure a conclusão da cópia e da verificação de integridade, não apenas o início "Enviando backup criptografado".

**Não apague o remoto, não recrie o remoto `crypt`, não troque as senhas/salts de criptografia e não publique `rclone.conf`.** Perder esses dados pode impedir a recuperação dos arquivos antigos. Antes de qualquer mudança, guarde uma cópia segura e **criptografada** do arquivo de configuração do rclone.

## Passo a passo para o administrador Windows

1. No Google Cloud, use um projeto sob seu controle (pode ser o mesmo projeto Google usado no launcher, mas as credenciais devem ser de um **cliente OAuth apropriado ao rclone**, não o cliente do launcher). Ative a Google Drive API e configure o consentimento OAuth conforme o tipo de uso. Se o app estiver em modo *Testing*, considere as limitações de refresh token e usuários de teste; para backups contínuos, use uma configuração que não interrompa o acesso periodicamente.
2. Crie um OAuth Client ID do tipo **Desktop app**, seguindo a documentação oficial: https://rclone.org/drive/#making-your-own-client-id . Guarde Client ID e Client Secret em local privado.
3. Faça backup seguro de `rclone.conf` e confira os nomes dos remotos **sem colar credenciais em chats**:

   ```powershell
   rclone listremotes
   rclone config file
   ```

4. Atualize **somente** o remoto Drive `dauntless-drive`:

   ```powershell
   rclone config
   ```

   Escolha editar `dauntless-drive` e informe o novo Client ID/Client Secret. Preserve `root_folder_id`, `team_drive`, `scope`, `token` e demais parâmetros que já identificam o Drive correto, salvo quando a própria autorização exigir a atualização. Siga as perguntas interativas para reautorizar o remoto se necessário. **Não altere o remoto `dauntless-crypt` nem suas chaves.**

5. Valide que o Drive e a camada criptografada continuam acessíveis, usando listagem de baixo impacto:

   ```powershell
   rclone lsf dauntless-drive: --max-depth 1
   rclone lsf dauntless-crypt: --max-depth 1
   ```

6. Execute o fluxo de backup já existente e **aguarde a verificação `cryptcheck` e o estado de sucesso**. Uma mensagem de NOTICE sozinha não comprova a conclusão. Para uma recuperação real, teste a leitura de um backup histórico em uma pasta de teste isolada, sem sobrescrever o banco de produção.

## Cuidados com o projeto

- **Google OAuth do launcher** autentica o jogador; **OAuth do rclone** autoriza acesso ao Google Drive; **Supabase** registra identidade e progresso. São integrações diferentes e não devem compartilhar tokens nem secrets por conveniência.
- O remoto `dauntless-crypt` deve continuar sendo um `crypt` com criptografia de dados ativa, apontando para o mesmo destino criptografado.
- Backups contendo `account.key`, bancos de dados, certificados e segredos precisam ser armazenados criptografados, com acesso restrito.
- Nunca mude `client_id` do remoto Drive em meio a um upload. Interrompa apenas **após** confirmar que o backup anterior terminou ou falhou e faça a reautorização com o processo parado.
- A migração do OAuth **não resolve** a falha do servidor nativo Ramsgate, nem ativa o host Google no Metagame.

## Verificações de aceitação

- [ ] Remoto Drive autenticado com Client ID próprio, sem aviso de descontinuação.
- [ ] Remoto crypt mantém a configuração original e lista os backups antigos.
- [ ] Novo backup enviado e verificado por `cryptcheck`.
- [ ] Restauração de teste realizada em pasta isolada, sem alterar personagens de produção.
- [ ] Último backup validado antes de mudar de host ou formatar o PC.

Se um passo falhar, **não apague nada**: preserve o `rclone.conf` anterior e examine a mensagem de erro, ocultando tokens e credenciais.
