'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),https=require('node:https'),crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs');
const {parseEndpoint,origin,lanRequest}=require('../src/fenys-network');
const {createGateway,allowed}=require('../src/fenys-public-gateway');
const {startRelay}=require('../src/fenys-public-relay');
const {encodeInvite,decodeInvite}=require('../src/fenys-google-cloud');
const {prepareGoogleFiles,validateNetwork}=require('../src/fenys-google-setup');
const tls=require('./fixtures/network-tls.json');
const lookup=(_host,options,cb)=>cb(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4);
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));
const close=s=>new Promise(r=>{s.closeAllConnections?.();s.close(r);});
function request(port,path,options={}){return new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port,path,method:options.method||'GET',headers:options.headers||{}},r=>{let body='';r.on('data',d=>body+=d);r.on('end',()=>resolve({status:r.statusCode,body}));});q.on('error',reject);q.end(options.body);});}
test('endereços LAN e HTTPS públicos preservam convites sem permitir HTTP na internet',()=>{
 for(const ip of ['10.1.2.3','172.16.0.5','192.168.1.20'])assert.equal(parseEndpoint(ip).lan,true);
 assert.equal(origin('https://play.example.com:8443'),'https://play.example.com:8443');
 for(const bad of ['8.8.8.8:61000','http://play.example.com','https://user:secret@play.example.com','https://example.com/x','https://example.com?x','https://127.1','https://10.0.0.1','https://example.com#x','https://example.com:0','https://a..com'])assert.throws(()=>parseEndpoint(bad),Error,bad);
 for(const address of ['192.168.1.20:61000','https://play.example.com'])assert.equal(decodeInvite(encodeInvite(address,'a'.repeat(48),Date.now()+10000,'x'.repeat(60))).address,address);
});
test('gateway permite jogo e Google, bloqueia gestão e caminhos ambíguos',()=>{
 assert(allowed('/character','POST'));assert(allowed('/launcher/google/join','POST'));
 for(const p of ['/launcher/google/invite','/launcher/google/host-invite','/launcher/google/sync-now','/launcher/roaming/checkout','/internal/backup','/undaunted/api/Register','/undaunted/api/CreateInvite','/UNDAUNTED/api/CreateInvite','/%75ndaunted/api/CreateInvite','/a/../undaunted/api/CreateInvite','//undaunted/api/CreateInvite'])assert.equal(allowed(p,'POST'),false,p);
});
test('acesso LAN exige origem privada direta e recusa cabeçalhos de proxy',()=>{
 const req={socket:{remoteAddress:'::ffff:192.168.1.25'},headers:{}};assert.equal(lanRequest(req),true);
 for(const remoteAddress of ['8.8.8.8','100.64.1.25','::1'])assert.equal(lanRequest({...req,socket:{remoteAddress}}),false);
 for(const name of ['via','forwarded','x-forwarded-for','x-forwarded-host','x-real-ip','x-dauntless-gateway'])assert.equal(lanRequest({...req,headers:{[name]:'anything'}}),false);
});
test('HTTPS real e ponte local protegem API, corpo, QoS, destino TLS e chat WebSocket',async t=>{
 const chat=http.createServer();chat.on('upgrade',(req,socket)=>{const accept=crypto.createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');socket.on('data',d=>socket.write(d));socket.on('error',()=>{});socket.on('end',()=>socket.destroy());});const chatPort=await listen(chat);
 const gateway=createGateway((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/candidate/regions'?{payload:{regionUrls:['http://127.0.0.1:61000/QoS']}}:{url:req.url,body,public:req.dluPublic,via:req.headers.via,gameKey:req.headers['x-undaunted-gameserver-apikey']||null}));});},{...tls,chatPort});const port=await listen(gateway);
 const relay=await startRelay('https://public.test:'+port,{ca:tls.cert,lookup});
 t.after(async()=>{await relay.close();await close(gateway);await close(chat);});
 const good=await request(relay.port,'/launcher/google/join',{method:'POST',body:'{"name":"Player"}',headers:{'content-type':'application/json','x-undaunted-gameserver-apikey':'never-forward'}});assert.equal(good.status,200);const data=JSON.parse(good.body);assert.equal(data.body,'{"name":"Player"}');assert.equal(data.public,true);assert.equal(data.gameKey,null);assert.equal(data.via,'1.1 dlu-public');
 assert.equal((await request(relay.port,'/launcher/google/invite',{method:'POST'})).status,403);
 assert.equal((await request(relay.port,'/character',{headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await request(relay.port,'/character',{headers:{'sec-fetch-mode':'no-cors','sec-fetch-site':'cross-site'}})).status,403);
 const qos=JSON.parse((await request(relay.port,'/candidate/regions')).body);assert.deepEqual(qos.payload.regionUrls,['http://'+relay.address+'/QoS']);
 const untrusted=await startRelay('https://public.test:'+port,{lookup});try{assert.equal((await request(untrusted.port,'/character')).status,502);}finally{await untrusted.close();}
 await new Promise((resolve,reject)=>{const q=http.request({host:'127.0.0.1',port:relay.port,path:'/',headers:{connection:'Upgrade',upgrade:'websocket','sec-websocket-version':'13','sec-websocket-key':crypto.randomBytes(16).toString('base64')}});q.on('error',reject);q.on('response',()=>reject(Error('WebSocket recusado')));q.on('upgrade',(_r,s)=>{s.on('error',reject);s.once('data',d=>{assert.equal(d.toString(),'transport-test');s.destroy();resolve();});s.write('transport-test');});q.end();});
});

test('troca de rede conserva configuração, módulos e cadastro se a compilação ou a nuvem falhar',async t=>{
 const path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
 const {identity}=require('../src/fenys-google-cloud');
 for(const failure of ['build','cloud',null]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'launcher-network-setup-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const base=path.join(dir,'UndauntedMetagame'),moduleDir=path.join(base,'fenys');fs.mkdirSync(moduleDir,{recursive:true});fs.mkdirSync(path.join(base,'src'));fs.mkdirSync(path.join(dir,'UndauntedDeployServer'));
  const source=path.resolve('server/upstream');
  for(const name of ['src/app.ts','src/server.ts'])fs.copyFileSync(path.join(source,'UndauntedMetagame',name),path.join(base,name));
  for(const service of ['UndauntedMetagame','UndauntedDeployServer'])fs.copyFileSync(path.join(source,service,'.env.example'),path.join(dir,service,'.env'));
  const config={...identity(),realm:crypto.randomUUID(),address:'100.64.1.2:61000'},file=path.join(moduleDir,'google-host.json');fs.writeFileSync(file,JSON.stringify(config));
  const oldModule=path.join(moduleDir,'fenys-google-host.js');fs.writeFileSync(oldModule,'// previous installed host');const before=fs.readFileSync(path.join(base,'.env'));
  let builds=0;const registrations=[];
  const spawn=(_command,args)=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(){}};child.kill=()=>{};const build=args[0].endsWith('tsc');if(build)builds++;queueMicrotask(()=>child.emit('close',build&&builds===1&&failure==='build'?1:0));return child;};
  const cloud=async(_operation,{envelope})=>{const c=JSON.parse(envelope.message);registrations.push(c.address);assert.ok(builds>0,'publish only after compilation');if(failure==='cloud'&&registrations.length===1)throw Error('network offline');return {registered:true};};
  const context={module:{exports:{}},__dirname:path.resolve('src'),process,Buffer,setTimeout,clearTimeout,require:n=>n==='node:child_process'?{spawn}:n==='node:os'?{networkInterfaces:()=>({lan:[{address:'192.168.2.20'}]})}:n==='./fenys-google-cloud'?{...require('../src/fenys-google-cloud'),cloud,availability:async()=>true}:n.startsWith('./')?require('../src/'+n.slice(2)):require(n)};
  vm.runInNewContext(fs.readFileSync('src/fenys-google-setup.js','utf8'),context);
  const activate=()=>context.module.exports.installGoogle(dir,{networkMode:'lan',address:'192.168.2.20:61000',adminKey:'UUK_'+'a'.repeat(48)});
  if(failure){await assert.rejects(activate());assert.deepEqual(JSON.parse(fs.readFileSync(file)),config);assert.deepEqual(fs.readFileSync(path.join(base,'.env')),before);assert.equal(fs.readFileSync(oldModule,'utf8'),'// previous installed host');assert.equal(fs.existsSync(path.join(moduleDir,'fenys-network.js')),false);assert.deepEqual(registrations,failure==='build'?[]:['192.168.2.20:61000',config.address]);}
  else{const result=await activate();assert.equal(result.networkMode,'lan');assert.equal(JSON.parse(fs.readFileSync(file)).address,'192.168.2.20:61000');assert.deepEqual(registrations,['192.168.2.20:61000']);assert.ok(fs.existsSync(path.join(moduleDir,'fenys-network.js')));}
 }
});
test('validação da Edge aceita LAN e HTTPS e recusa destinos ambíguos',()=>{
 const src=require('node:module').stripTypeScriptTypes(fs.readFileSync('supabase/functions/fenys-global/players.ts','utf8')).replace('export async function','async function');const ctx={URL};vm.createContext(ctx);vm.runInContext(src+'\nthis.valid=validHostAddress;',ctx);
 for(const address of ['100.64.1.2:61000','10.1.2.3:61000','192.168.1.20:61000','https://public.test:8443'])assert.equal(ctx.valid(address),true,address);
 for(const address of ['100.999.1.2:61000','http://public.test','https://public.test/','https://127.0.0.1','https://10.1.2.3','https://public.test@evil.test','https://public.test:0'])assert.equal(ctx.valid(address),false,address);
});

test('configuração LAN/pública mantém serviços internos no loopback',()=>{
 const root='server/upstream/';const input={appSource:fs.readFileSync(root+'UndauntedMetagame/src/app.ts','utf8'),serverSource:fs.readFileSync(root+'UndauntedMetagame/src/server.ts','utf8'),metagameEnv:fs.readFileSync(root+'UndauntedMetagame/.env.example','utf8'),deployEnv:fs.readFileSync(root+'UndauntedDeployServer/.env.example','utf8')};
 const lan=prepareGoogleFiles({...input,address:'192.168.1.20:61000',networkMode:'lan'});assert.match(lan.metagameEnv,/FENYS_LAN_IP=192.168.1.20/);assert.match(lan.metagameEnv,/BIND_HOST=127.0.0.1/);assert.match(lan.deployEnv,/MY_IP=192.168.1.20/);
 const pub=prepareGoogleFiles({...input,address:'https://public.test:8443',networkMode:'public',gameAddress:'203.0.113.10'});assert.match(pub.metagameEnv,/FENYS_PUBLIC_MODE=1/);assert.match(pub.metagameEnv,/FENYS_PUBLIC_PORT=8443/);assert.match(pub.deployEnv,/MY_IP=203.0.113.10/);assert.match(pub.deployEnv,/BIND_HOST=127.0.0.1/);assert.match(pub.metagameEnv,/FENYS_TAILSCALE_IP=\r?$/m);
});

test('ativação Google LAN aceita apenas IPv4 local válido e oferece explicação útil',()=>{
 const configured=validateNetwork({networkMode:'lan',address:'192.168.1.20:61000'},['192.168.1.20']);
 assert.equal(configured.sv.address,'192.168.1.20:61000');
 assert.throws(()=>validateNetwork({networkMode:'lan',address:'127.0.0.1:61000'},['127.0.0.1']),/não informe 127.0.0.1/);
 assert.throws(()=>validateNetwork({networkMode:'lan',address:'192.168.1.21:61000'},['192.168.1.20']),/selecione o IPv4 deste computador/);
 const renderer=fs.readFileSync('src/renderer.js','utf8'),html=fs.readFileSync('src/index.html','utf8'),preload=fs.readFileSync('src/preload.js','utf8');
 assert.match(renderer,/\$\('google-network-address-fields'\)\.hidden=false/);
 assert.match(renderer,/localAddresses\(\)/);
 assert.match(preload,/network:localIPv4/);
 assert.match(html,/id="google-lan-ip-suggestions"/);
});
