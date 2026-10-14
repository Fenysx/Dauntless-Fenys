'use strict';
// Do not trust a TCP-open port or a single launcher-managed process as proof
// that it is safe to stop/reconfigure both local server services.
function servicesOwnedByLauncher(state){
 return Boolean(state?.metagame && state?.deploy && Array.isArray(state.owned)
  && state.owned.includes('metagame') && state.owned.includes('deploy'));
}
// A failed legacy-events lookup may be tolerated only if the old authority has
// already moved to Google. A positive onlineCount must NEVER be caught as a
// transport error: reconfiguring with players online risks losing their saves.
async function verifyLegacyHostIdle(readEvents,checkMigratedAuthority){
 let events;
 try{events=await readEvents();}
 catch(error){
  const source=await checkMigratedAuthority().catch(()=>null);
  if(source?.mode!=='google')throw error;
  return {legacyAuthorityMigrated:true};
 }
 if(!Number.isSafeInteger(events?.onlineCount)||events.onlineCount<0)
  throw Error('Não foi possível confirmar se há jogadores online no servidor antigo.');
 if(events.onlineCount>0)
  throw Error('Encerre as partidas antes de migrar o host.');
 return {legacyAuthorityMigrated:false};
}
module.exports={servicesOwnedByLauncher,verifyLegacyHostIdle};
