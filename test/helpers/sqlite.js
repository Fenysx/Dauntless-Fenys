'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function database(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(fs.readFileSync(path.join(__dirname,'../fixtures/metagame-schema.sql'),'utf8'));
 // Small adapter so the native Node test database exercises the production better-sqlite3 API.
 let depth=0,sequence=0;
 db.transaction=fn=>{const tx=(...args)=>{const nested=depth>0,name='test_savepoint_'+(++sequence);db.exec(nested?'SAVEPOINT '+name:'BEGIN IMMEDIATE');depth++;try{const r=fn(...args);db.exec(nested?'RELEASE '+name:'COMMIT');return r;}catch(e){db.exec(nested?'ROLLBACK TO '+name:'ROLLBACK');if(nested)db.exec('RELEASE '+name);throw e;}finally{depth--;}};tx.immediate=tx;return tx;};
 return db;
}
module.exports={database};
