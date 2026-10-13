'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GoogleAuth}=require('../src/fenys-google-auth');
const {GooglePlayer}=require('../src/fenys-google-player');
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('sair da conta Google limpa sessão local mesmo se revogação remota estiver offline',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'google-logout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const auth=new GoogleAuth({directory:dir,protect:x=>Buffer.from(x),unprotect:x=>x.toString(),
  fetchImpl:async()=>{throw Error('rede indisponível');}});
 auth.write({access_token:'access',refresh_token:'refresh',expires_at:Date.now()/1000+3000,user:{id:'user',email:'test@example.test'}});
 assert.ok(fs.existsSync(auth.file()));
 const result=await auth.signOut();
 assert.equal(result.signedIn,false);
 assert.match(result.notice,/não foi possível confirmar a revogação/);
 assert.equal(fs.existsSync(auth.file()),false);
});
test('logout de personagem propaga aviso remoto e limpa seleção do servidor',async()=>{
 let signedIn=true,settings={googleSelected:true,googleServer:null};
 const auth={state:()=>({signedIn}),signOut:async()=>{signedIn=false;return {signedIn:false,notice:'revogação não confirmada'};}};
 const client=new GooglePlayer({auth,settings:()=>settings,saveSettings:s=>settings=s});
 client.profile={linked:true,name:'Original',userId:'old',revision:9};
 const response=await client.signOut();
 assert.equal(response.signedIn,false);
 assert.equal(response.linked,false);
 assert.equal(settings.googleSelected,false);
 assert.match(response.notice,/revogação não confirmada/);
});
test('se host não confirma saída do personagem, mantém sessão para proteger saves',async()=>{
 let settings={googleSelected:true,googleServer:'192.168.1.20:61000'},signedIn=true;
 const auth={state:()=>({signedIn}),token:async()=> 'jwt',signOut:async()=>{signedIn=false;}};
 const client=new GooglePlayer({auth,settings:()=>settings,saveSettings:s=>settings=s,hostRequest:async()=>{throw Error('host offline');}});
 client.profile={linked:true,userId:'old',name:'Original'};
 await assert.rejects(client.signOut(),/host offline/);
 assert.equal(signedIn,true);
 assert.equal(settings.googleSelected,true);
 assert.equal(client.state().linked,true);
});
