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
// Do not report a successful activation while the running Metagame still has
// no Google routes or has not finished registering with the cloud.
async function confirmGoogleRuntime({checkHost,expectedAddress,attempts=12,delay=()=>new Promise(r=>setTimeout(r,500))}={}){
 if(typeof checkHost!=='function'||!Number.isSafeInteger(attempts)||attempts<1||attempts>30)
  throw Error('Verificação de integração Google inválida.');
 for(let i=0;i<attempts;i++){
  let state;try{state=await checkHost();}catch{}
  if(state?.mode==='google'&&state.registered===true&&state.address===expectedAddress)return true;
  if(i<attempts-1)await delay();
 }
 throw Error('O Metagame reiniciou, mas não confirmou /launcher/google/status e o registro do host. A ativação não foi validada. Confira o diagnóstico; não vincule nem crie personagens até corrigir o servidor.');
}
module.exports={verifyExistingCharacterSource,confirmGoogleRuntime};
