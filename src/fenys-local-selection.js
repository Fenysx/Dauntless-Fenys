'use strict';
// Selecting a destination is not the same as transferring Google saves.
// Never drop an existing cloud selection until the new host has safely joined.
const LOCAL='127.0.0.1:61000';
const {parseEndpoint}=require('./fenys-network');

async function selectLocalServer({load,save,assertGameClosed,isGoogleSignedIn,checkGoogleHost,googleHome,globalState,globalHome,localOnline}){
 assertGameClosed();
 const existing=load();
 const remoteGoogle=Boolean(existing.googleSelected&&existing.googleServer&&!parseEndpoint(existing.googleServer).local);
 if(remoteGoogle){
  // Switching away from an active cloud host must preserve a single owner
  // and synchronize changes. Failure leaves the previous destination intact.
  if(!isGoogleSignedIn())throw Error('Entre com a mesma conta Google antes de trocar do servidor da comunidade para o local. Seu progresso permanece protegido.');
  let caps;
  try{caps=await checkGoogleHost();}catch{}
  if(caps?.mode!=='google'||caps.registered!==true)throw Error('O servidor local ainda não confirmou a integração Google. Inicie o Metagame local em Hospedar servidor e confirme o status Google antes de transferir seu personagem. O servidor anterior continua selecionado.');
  await googleHome(LOCAL);
 }
 else if(!existing.googleSelected&&globalState().global){
  await globalHome(existing.cloudAuthority);
 }
 const config=load();
 if(config.googleSelected&&config.googleServer&&!parseEndpoint(config.googleServer).local)
  throw Error('A transferência Google não foi confirmada. O servidor anterior continua selecionado para proteger seu personagem.');
 save({...config,gameServer:LOCAL});
 const online=await localOnline();
 return {selected:true,server:LOCAL,online:!!online,cloudReady:!!(config.googleSelected&&config.googleServer&&parseEndpoint(config.googleServer).local)};
}
module.exports={selectLocalServer,LOCAL};
