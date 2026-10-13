'use strict';
// Generates local enrollment material only; no live database changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ENDPOINT}=require('../src/fenys-supabase');
const directory=path.resolve(__dirname,'../runtime/cloud-enrollment');
if(fs.existsSync(directory))throw Error('Autorização existente preservada. Guarde-a antes de gerar outra em um checkout novo.');
fs.mkdirSync(path.dirname(directory),{recursive:true});fs.mkdirSync(directory,{mode:0o700});
const secret=crypto.randomBytes(24).toString('hex');
fs.writeFileSync(path.join(directory,'authorization.json'),JSON.stringify({format:'FENYS-SUPABASE-1',endpoint:ENDPOINT,secret,encryptionKey:crypto.randomBytes(32).toString('hex')},null,2)+'\n',{mode:0o600,flag:'wx'});
const hash=crypto.createHash('sha256').update(secret).digest('hex');
fs.writeFileSync(path.join(directory,'activation.sql'),`-- Execute uma vez no projeto Supabase configurado. Não contém a chave privada.\ninsert into fenys_global.activations(secret_hash,expires_at) values ('${hash}',now()+interval '24 hours');\n`,{mode:0o600,flag:'wx'});
console.log('Arquivos privados gerados em '+directory+'. Siga docs/NUVEM.md; não publique essa pasta.');
