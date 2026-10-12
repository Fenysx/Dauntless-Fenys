'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const {createTailscale,findCli,stateFromStatus,authURL,downloadInstaller,verifyInstaller,commandEnvironment,INSTALLER_URL}=require('../src/fenys-tailscale');
test('PowerShell Windows carrega módulos próprios mesmo quando o launcher veio do PowerShell 7',()=>{
 const env={PSModulePath:'C:\\Program Files\\PowerShell\\7\\Modules',LOCALAPPDATA:'C:\\Users\\Player\\AppData\\Local'};
 const output=commandEnvironment('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',env);
 assert.equal(output.PSModulePath,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules');
 assert.equal(output.LOCALAPPDATA,env.LOCALAPPDATA);assert.notEqual(output,env);
 assert.equal(commandEnvironment('C:\\Program Files\\Tailscale\\tailscale.exe',env),env);
});
test('detecta executável Windows instalado sem executar binários do diretório atual',()=>{
 const cli=findCli('win32',{ProgramFiles:'C:\\Program Files'},p=>p==='C:\\Program Files\\Tailscale\\tailscale.exe');
 assert.equal(cli,'C:\\Program Files\\Tailscale\\tailscale.exe');
 assert.equal(findCli('win32',{},()=>false),null);
});
test('status sanitizado distingue conexão, login e dispositivo aguardando aprovação',()=>{
 const connected=stateFromStatus({BackendState:'Running',TailscaleIPs:['100.64.1.2','fd7a::1','8.8.8.8','100.64.1.2:9999'],Peer:{private:'hidden'},AuthURL:'secret'});
 assert.equal(connected.connected,true);assert.deepEqual(connected.addresses,['100.64.1.2']);
 assert.doesNotMatch(JSON.stringify(connected),/secret|hidden|Peer|AuthURL/);
 for(const state of ['Stopped','NeedsLogin','NeedsMachineAuth']){
  const data=stateFromStatus({BackendState:state,TailscaleIPs:['100.64.1.2']});assert.equal(data.connected,false);assert.deepEqual(data.addresses,[]);
 }
 assert.match(stateFromStatus({BackendState:'NeedsMachineAuth'}).message,/aprovação/);
});
test('abre somente o login oficial retornado pelo Tailscale',()=>{
 assert.equal(authURL('https://login.tailscale.com/a/abc123'),'https://login.tailscale.com/a/abc123');
 for(const value of ['http://login.tailscale.com/a/abc','https://evil.com/a/abc','https://login.tailscale.com.evil.com/a/abc','https://user:pass@login.tailscale.com/a/abc','file:///C:/evil.exe','https://login.tailscale.com/admin/machines'])assert.throws(()=>authURL(value));
});
test('login começa no navegador e status passa a conectado, sem alterar preferências existentes',async()=>{
 let connected=false;const urls=[],commands=[];
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>child.emit('close',1);
 const manager=createTailscale({platform:'linux',find:()=>'/usr/bin/tailscale',run:async(_file,args)=>{commands.push(args);return JSON.stringify({BackendState:connected?'Running':'NeedsLogin',TailscaleIPs:connected?['100.64.1.2']:[]});},
  openExternal:async url=>{urls.push(url);},spawnCli:(_file,args,options)=>{commands.push(args);assert.equal(options.shell,false);queueMicrotask(()=>child.stdout.emit('data',Buffer.from('{"AuthURL":"https://login.tailscale.com/a/abc123","BackendState":"NeedsLogin"}')));return child;}});
 const result=await manager.connect();assert.match(result.message,/navegador/);assert.equal(urls.length,1);
 assert.deepEqual(commands[1],['up','--json','--timeout=90s']);assert.doesNotMatch(commands.flat().join(' '),/reset|auth-key|force-reauth|accept-routes/);
 connected=true;child.emit('close',0);
 assert.equal((await manager.status()).connected,true);manager.dispose();
});
test('modo em segundo plano usa apenas set unattended e confirma preferência após permissão Windows',async()=>{
 let background=false;const scripts=[];
 const manager=createTailscale({platform:'win32',find:()=>"C:\\Program Files\\Tailscale\\tailscale.exe",run:async(_file,args)=>{
  if(args[0]==='status')return JSON.stringify({BackendState:'Running',TailscaleIPs:['100.64.1.2']});
  if(args[0]==='get')return JSON.stringify({unattended:background});
  const script=Buffer.from(args.at(-1),'base64').toString('utf16le');scripts.push(script);background=true;return '';
 }});
 assert.equal((await manager.status()).background,false);await manager.background();
 assert.equal((await manager.status()).background,true);
 assert.match(scripts[0],/set','--unattended=true/);assert.match(scripts[0],/-Verb RunAs/);assert.doesNotMatch(scripts[0],/reset|down|auth-key/);
});
test('download só é aberto depois da verificação de checksum e assinatura',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-vpn-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const payload=Buffer.from('official-fixture'),digest=crypto.createHash('sha256').update(payload).digest('hex'),urls=[];let verified=false;
 const file=await downloadInstaller(dir,{fetchImpl:async url=>{urls.push(url);return new Response(url.endsWith('.sha256')?digest:payload);},verify:async file=>{assert.deepEqual(fs.readFileSync(file),payload);verified=true;}});
 assert.equal(verified,true);assert.ok(fs.existsSync(file));assert.deepEqual(urls,[INSTALLER_URL,INSTALLER_URL+'.sha256']);
 let opened=false;
 const manager=createTailscale({platform:'win32',find:()=>null,installerDirectory:dir,download:async()=>file,openInstaller:async target=>{assert.equal(target,file);opened=true;return '';}});
 await manager.install();assert.equal(opened,true);
});
test('download com checksum errado, tamanho excessivo ou assinatura inválida não fica disponível para execução',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fenys-vpn-fail-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const payload=Buffer.from('installer-fixture');
 const fetchImpl=async url=>new Response(url.endsWith('.sha256')?'0'.repeat(64):payload);
 await assert.rejects(downloadInstaller(dir,{fetchImpl,verify:async()=>assert.fail('Não verificar um download adulterado')}),/diferente/);
 assert.deepEqual(fs.readdirSync(dir),[]);
 await assert.rejects(downloadInstaller(dir,{fetchImpl,maxBytes:2}),/maior/);assert.deepEqual(fs.readdirSync(dir),[]);
 const hash=crypto.createHash('sha256').update(payload).digest('hex');
 await assert.rejects(downloadInstaller(dir,{fetchImpl:async url=>new Response(url.endsWith('.sha256')?hash:payload),verify:async()=>{throw Error('Assinatura inválida');}}),/Assinatura/);
 assert.deepEqual(fs.readdirSync(dir),[]);
});
test('verificação Windows exige assinatura válida do publicador Tailscale e escapa caminho literal',async()=>{
 let script='';await verifyInstaller("C:\\Users\\O'Brien\\tailscale.exe",async(_file,args)=>{script=Buffer.from(args.at(-1),'base64').toString('utf16le');return JSON.stringify({status:'Valid',publisher:'Tailscale Inc.'});});
 assert.match(script,/Get-AuthenticodeSignature -LiteralPath/);assert.match(script,/O''Brien/);assert.match(script,/GetNameInfo/);
 await verifyInstaller('C:\\file.exe',async()=>JSON.stringify({status:'Valid',publisher:'Tailscale, Inc.'}));
 for(const info of [{status:'NotTrusted',publisher:'Tailscale Inc.'},{status:'Valid',publisher:'Another Company'},{status:'Valid',publisher:'Tailscale Inc. Fake'}])await assert.rejects(verifyInstaller('C:\\file.exe',async()=>JSON.stringify(info)),/não confirmada/);
 await assert.rejects(verifyInstaller('C:\\file.exe',async()=>''),/assinatura/);
});
