'use strict';
// Downloads only an explicitly configured 1.4.4 manifest. Never executes downloaded content.
// A source must be HTTPS, or the host's private 100.64.0.0/10 Tailscale address.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const PINNED_MANIFEST=require('./game-manifest.json');

function sourceURL(input){
  let url;
  try{url=new URL(input);}catch{throw Error('Informe a URL completa do manifesto fornecida pelo host.');}
  const match=url.hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  const tail=match&&match.slice(1).map(Number);
  const tailscale=tail&&tail.every(x=>x<=255)&&tail[0]===100&&tail[1]>=64&&tail[1]<=127;
  if(url.username||url.password||url.hash||!['https:','http:'].includes(url.protocol)||
    (url.protocol==='http:'&&!tailscale))throw Error('Fonte não permitida: use HTTPS ou HTTP em um IP privado Tailscale 100.64.0.0/10.');
  return url;
}
function safeRelative(value){
  if(typeof value!=='string'||!value||value.length>260||value.includes('\\')||value.startsWith('/'))throw Error('Caminho de arquivo inválido no manifesto.');
  const parts=value.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||! /^[A-Za-z0-9_ ()+.,@-]+$/.test(p)||p.startsWith(' ')||p.endsWith(' ')||p.endsWith('.')||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i.test(p)))throw Error('Caminho inseguro no manifesto: '+value);
  return parts;
}
function validateManifest(obj){
  if(!obj||obj.version!=='1.4.4'||!Array.isArray(obj.files)||obj.files.length===0||obj.files.length>1500)throw Error('Manifesto incompatível: é necessário Dauntless 1.4.4.');
  let total=0;const seen=new Set();
  const files=obj.files.map(f=>{
    const parts=safeRelative(f.path),key=parts.join('/').toLowerCase();
    if(seen.has(key))throw Error('Arquivo repetido no manifesto: '+key);
    seen.add(key);
    if(typeof f.sha256!=='string'||!/^[a-fA-F0-9]{64}$/.test(f.sha256)||!Number.isSafeInteger(f.size)||f.size<0||f.size>12*1024**3)throw Error('Hash ou tamanho inválido: '+f.path);
    total+=f.size;
    if(total>35*1024**3)throw Error('Manifesto excede o tamanho permitido.');
    return {path:parts.join('/'),sha256:f.sha256.toLowerCase(),size:f.size};
  });
  return {version:'1.4.4',files};
}

// The original content server offers {build,totalBytes,files}, not a user-defined
// manifest. Reject even a legitimate host if it differs from the 410 pinned files.
function verifyOriginalManifest(data,pinned=PINNED_MANIFEST){
 if(!data||data.build!==pinned.build||!Number.isSafeInteger(data.totalBytes)||
    data.totalBytes!==pinned.totalBytes||!Array.isArray(data.files)||
    data.files.length!==pinned.files.length)throw Error('Manifesto do servidor não corresponde ao Dauntless 1.4.4 fixado no launcher.');
 const files=new Map();
 for(const f of data.files){
  if(!f||typeof f.path!=='string'||files.has(f.path))throw Error('Arquivo duplicado/inválido no manifesto original.');
  safeRelative(f.path);
  files.set(f.path,f);
 }
 for(const expected of pinned.files){
  const actual=files.get(expected.path);
  if(!actual||actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('Conteúdo do host diferente do manifesto original: '+expected.path);
 }
 return {version:'1.4.4',files:pinned.files};
}

async function sha256(file){
  return new Promise((resolve,reject)=>{
    const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);
    stream.on('data',b=>hash.update(b));
    stream.once('error',reject);stream.once('end',()=>resolve(hash.digest('hex')));
  });
}
function noSymlink(base,parts){
  let candidate=base;
  for(const part of parts){
    candidate=path.join(candidate,part);
    if(fs.existsSync(candidate)&&fs.lstatSync(candidate).isSymbolicLink())throw Error('Link simbólico bloqueado na pasta do jogo: '+part);
  }
}
async function readManifest(url,key,fetcher,original=false,pinned=PINNED_MANIFEST){
  const r=await fetcher(url,{headers:key?{'X-Download-Key':key}:{},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Manifesto indisponível (HTTP '+r.status+'). Confira o host e a chave do Discord.');
  if(Number(r.headers.get('content-length')||0)>2*1024*1024)throw Error('Manifesto grande demais.');
  const body=await r.text();
  if(body.length>2*1024*1024)throw Error('Manifesto grande demais.');
  return original?verifyOriginalManifest(JSON.parse(body),pinned):validateManifest(JSON.parse(body));
}
async function syncGameFiles({manifestUrl,key='',folder,onProgress=()=>{},fetcher=fetch,pinnedManifest=PINNED_MANIFEST}){
  const url=sourceURL(manifestUrl);
  if(typeof key!=='string'||key.length>2048||/[\r\n]/.test(key))throw Error('Chave de download inválida.');
  if(!path.isAbsolute(folder)||!fs.existsSync(folder)||!fs.statSync(folder).isDirectory()||fs.lstatSync(folder).isSymbolicLink())throw Error('Selecione uma pasta de instalação local válida.');
  const original=url.pathname==='/content/v1/manifest';
  if(original&&!key)throw Error('O servidor original exige a key pessoal da conta registrada; um convite do Discord sozinho não permite baixar.');
  const manifest=await readManifest(url,key,fetcher,original,pinnedManifest);
  let downloaded=0,skipped=0;const root=fs.realpathSync(folder);
  for(const [i,f] of manifest.files.entries()){
    const parts=safeRelative(f.path);
    noSymlink(root,parts);
    const target=path.join(root,...parts);
    if(fs.existsSync(target)&&fs.statSync(target).isFile()&&fs.statSync(target).size===f.size&&await sha256(target)===f.sha256){skipped++;onProgress({current:i+1,total:manifest.files.length,file:f.path,downloaded,skipped});continue;}
    fs.mkdirSync(path.dirname(target),{recursive:true});
    noSymlink(root,parts.slice(0,-1));
    // Same origin as the manifest: never forward the private download key to other hosts.
    const fileUrl=original?new URL('/content/v1/files/'+parts.map(encodeURIComponent).join('/'),url):new URL('files/'+parts.map(encodeURIComponent).join('/'),url);
    if(fileUrl.origin!==url.origin)throw Error('Arquivo de origem diferente do manifesto.');
    const response=await fetcher(fileUrl,{headers:key?{[original?'x-undaunted-user-api-key':'X-Download-Key']:key}:{},redirect:'error',signal:AbortSignal.timeout(30*60*1000)});
    if(!response.ok||!response.body)throw Error('Falha ao baixar '+f.path+' (HTTP '+response.status+').');
    const tmp=target+'.dlu-part', backup=target+'.dlu-backup';
    if(fs.existsSync(tmp))fs.unlinkSync(tmp);
    let bytes=0;
    const meter=new Transform({transform(chunk,enc,cb){bytes+=chunk.length;if(bytes>f.size){cb(Error('Arquivo excedeu o tamanho declarado: '+f.path));}else cb(null,chunk);}});
    try{
      await pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(tmp,{flags:'wx',mode:0o600}));
      if(bytes!==f.size||await sha256(tmp)!==f.sha256)throw Error('Integridade SHA-256 falhou para '+f.path+'.');
      if(fs.existsSync(target)){
        if(fs.existsSync(backup))throw Error('Há um backup anterior. Revise '+backup+' antes de reparar.');
        fs.renameSync(target,backup);
      }
      try{fs.renameSync(tmp,target);}catch(e){if(fs.existsSync(backup)&&!fs.existsSync(target))fs.renameSync(backup,target);throw e;}
      downloaded++;
    }catch(e){if(fs.existsSync(tmp))fs.unlinkSync(tmp);throw e;}
    onProgress({current:i+1,total:manifest.files.length,file:f.path,downloaded,skipped});
  }
  return {downloaded,skipped,total:manifest.files.length,folder};
}
module.exports={sourceURL,safeRelative,validateManifest,verifyOriginalManifest,syncGameFiles};
