'use strict';
// Isolated broker for native Metagame CI. Actual Supabase RPC is verified separately.
const crypto=require('node:crypto');const {verify}=require('../../src/fenys-cloud-protocol');
function broker(){const authorized=new Map(),players=new Map(),authId=crypto.randomUUID(),token='isolated-google-'+crypto.randomUUID();
 const invoke=async(op,fields,bearer)=>{if(op==='profile'){if(bearer!==token)throw Error('Google identity required');const p=players.get(authId);return p?{linked:true,authId,userId:p.userId,name:p.name,key:p.key,schema:p.snapshot?.schema,activeHost:p.host?authorized.get(p.host):null,leaseUntil:p.leaseUntil,revision:p.revision}:{linked:false};}
  const s=verify(fields.envelope,op);if(!authorized.has(s.publicKey))throw Error('Trusted host required');if(op==='host-register')return {registered:true};if(['join','link'].includes(op)&&bearer!==token)throw Error('Google identity required');
  if(op==='link'){const old=players.get(authId);if(old&&old.userId!==s.userId)throw Error('Already linked');if(!old)players.set(authId,{userId:s.userId,name:s.snapshot.tables.users[0].name,key:s.nativeKey,snapshot:structuredClone(s.snapshot),revision:1,origin:s.publicKey});return {linked:true,revision:1};}
  const p=players.get(authId);if(!p)throw Error('Link the existing character first');
  if(op==='join'){if(Date.parse(p.leaseUntil)>Date.now()&&(p.host!==s.publicKey||p.session!==s.session))throw Error('Character active on another host');p.host=s.publicKey;p.session=s.session;p.leaseUntil=new Date(Date.now()+75000).toISOString();return {...structuredClone(p),authId,originHost:p.origin};}
  if(p.userId!==s.userId)throw Error('Owner mismatch');if(op==='save'&&p.commitId===s.commitId)return {revision:p.revision,commitId:p.commitId,leaseUntil:p.leaseUntil};if(p.host!==s.publicKey||p.session!==s.session)throw Error('Session mismatch');
  if(op==='save'){if(p.revision!==s.expectedRevision)throw Error('Stale progress');p.snapshot=structuredClone(s.snapshot);p.commitId=s.commitId;p.revision++;}
  if(op==='release'){p.leaseUntil=new Date(0).toISOString();return {released:true};}
  p.leaseUntil=new Date(Date.now()+75000).toISOString();return {revision:p.revision,commitId:p.commitId,leaseUntil:p.leaseUntil};
 };return {authorized,players,authId,token,invoke};}
module.exports={broker};
