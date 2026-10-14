'use strict';
// Read-only checks before linking a native character to a Google identity.
// Never return the old account key or mutate a save in a preflight.
async function verifyExistingCharacterSource({checkHost,checkAccount}={}){
 if(typeof checkHost!=='function'||typeof checkAccount!=='function')throw Error('Verificação do vínculo incompleta.');
 let caps;
 try{caps=await checkHost();}
 catch{
  throw Error('A integração Google não respondeu no servidor de origem (/launcher/google/status). Primeiro abra Hospedar servidor e ative a integração neste servidor; não crie outro personagem.');
 }
 if(caps?.mode!=='google'||caps?.registered!==true){
  throw Error('O Metagame do personagem antigo ainda não está integrado e registrado no Google. Conclua a ativação em Hospedar servidor antes de vincular. O save local permanece intacto.');
 }
 let account;
 try{account=await checkAccount();}
 catch{
  throw Error('A chave original não foi reconhecida neste servidor. Selecione em Configurações a chave da conta que possui o personagem existente; não substitua a chave nem crie outro personagem.');
 }
 if(!account||!/^UID-[a-f0-9-]{36}$/i.test(account.UserId)||typeof account.Username!=='string'||!account.Username.trim()){
  throw Error('O Metagame não confirmou a identidade do personagem antigo. Confira a chave original e a versão do servidor; o vínculo não foi enviado.');
 }
 return {userId:account.UserId,name:account.Username};
}
module.exports={verifyExistingCharacterSource};
