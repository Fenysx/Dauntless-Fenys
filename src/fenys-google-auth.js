'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const URL='https://hbbtbbqsauivnierqxvh.supabase.co';
const KEY='sb_publishable_kqgHb0iGRCCtlSVbKmmMTQ_GbGBHxZ6';
const PORT=43967;
class GoogleAuth{
 constructor({directory,protect,unprotect,openExternal,fetchImpl=fetch,port=PORT}){Object.assign(this,{directory,protect,unprotect,openExternal,fetchImpl,port});this.memory=null;this.refreshing=null;this.cancel=null;}
 file(){return path.join(this.directory,'google-session.bin');}
 read(){if(this.memory)return this.memory;try{if(!this.unprotect)return null;return this.memory=JSON.parse(this.unprotect(fs.readFileSync(this.file())));}catch(e){if(e.code==='ENOENT')return null;throw Error('Entre novamente com Google para recuperar sua sessão.');}}
 write(value){this.memory=value;if(this.protect){fs.mkdirSync(this.directory,{recursive:true,mode:0o700});const temp=this.file()+'.tmp';fs.writeFileSync(temp,this.protect(JSON.stringify(value)),{mode:0o600});fs.renameSync(temp,this.file());}}
 clear(){this.memory=null;fs.rmSync(this.file(),{force:true});}
 state(){let s;try{s=this.read();}catch{}return {signedIn:!!s,email:s?.user?.email||null,pending:!!this.cancel};}
 async api(route,{token,body,method=body?'POST':'GET'}={}){const r=await this.fetchImpl(URL+'/auth/v1/'+route,{method,headers:{apikey:KEY,...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(20000)});const text=await r.text();if(text.length>1024*1024)throw Error('Resposta de autenticação inválida.');let result;try{result=text?JSON.parse(text):{};}catch{throw Error('O login Google não foi confirmado.');}if(!r.ok){const error=Error('O login Google não foi confirmado. Entre novamente ou confira a configuração do provedor.');error.status=r.status;throw error;}return result;}
 async provider(){const s=await this.api('settings');return s.external?.google===true;}
 async accept(s){if(typeof s.access_token!=='string'||typeof s.refresh_token!=='string')throw Error('Sessão Google incompleta.');const user=await this.api('user',{token:s.access_token});if(!user.id||!user.identities?.some(i=>i.provider==='google'))throw Error('Use uma conta autenticada pelo Google.');this.write({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at||Math.floor(Date.now()/1000)+(s.expires_in||3600),user:{id:user.id,email:user.email||null}});return this.state();}
 async token(){const s=this.read();if(!s)throw Error('Clique em Continuar com Google antes de acessar o personagem na nuvem.');if(s.expires_at>Date.now()/1000+60)return s.access_token;if(!this.refreshing)this.refreshing=this.api('token?grant_type=refresh_token',{body:{refresh_token:s.refresh_token}}).then(r=>this.accept(r)).catch(e=>{if([400,401,403].includes(e.status))this.clear();throw e;}).finally(()=>{this.refreshing=null;});await this.refreshing;return this.read().access_token;}
 async login(){
  if(this.cancel)throw Error('O login Google já está em andamento.');if(!await this.provider())throw Error('O Google ainda está desativado no Supabase. Configure Client ID, Client Secret e o retorno do launcher antes de entrar.');
  const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url'),nonce=crypto.randomBytes(24).toString('hex'),callback='/oauth/callback/'+nonce;
  return new Promise((resolve,reject)=>{
   let finished=false,exchanging=false;const server=http.createServer(async(req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('content-security-policy',"default-src 'none'");
    if(req.method!=='GET'||String(req.url).length>8192){res.writeHead(400);res.end();return;}
    const u=new globalThis.URL(req.url,'http://127.0.0.1');if(u.pathname!==callback||!req.headers.host?.startsWith('127.0.0.1:')){res.writeHead(404);res.end();return;}
    if(exchanging){res.writeHead(409);res.end();return;}if(u.searchParams.has('error')){res.end('Login cancelado. Retorne ao launcher.');finish(Error('Login Google cancelado.'));return;}
    const code=u.searchParams.get('code');if(!code||code.length>4096){res.writeHead(400);res.end();return;}exchanging=true;
    try{const s=await this.api('token?grant_type=pkce',{body:{auth_code:code,code_verifier:verifier}});await this.accept(s);res.end('Login confirmado. Pode retornar ao Dauntless Launcher Ultimate.');finish(null,{...this.state(),pending:false});}catch(e){res.writeHead(400);res.end('Login nao confirmado. Retorne ao launcher.');finish(e);}
   });
   const timer=setTimeout(()=>finish(Error('O login Google expirou. Tente novamente.')),300000);
   const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);this.cancel=null;server.close();error?reject(error):resolve(value);};this.cancel=()=>finish(Error('Login cancelado.'));
   server.once('error',()=>finish(Error('Não foi possível abrir o retorno local do Google. Feche outra sessão do launcher e tente novamente.')));
   server.listen(this.port,'127.0.0.1',()=>{
    const redirect='http://127.0.0.1:'+server.address().port+callback,url=new globalThis.URL(URL+'/auth/v1/authorize');url.search=new URLSearchParams({provider:'google',redirect_to:redirect,code_challenge:challenge,code_challenge_method:'s256',scopes:'openid email profile'}).toString();Promise.resolve(this.openExternal(url.toString())).catch(e=>finish(e));
   });
  });
 }
 async signOut(){this.cancel?.();let s;try{s=this.read();}catch{}try{if(s)await this.api('logout?scope=local',{token:s.access_token,method:'POST'});}finally{this.clear();}return this.state();}
 dispose(){this.cancel?.();}
}
module.exports={GoogleAuth,URL,KEY,PORT};
