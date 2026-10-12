'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function database(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(fs.readFileSync(path.join(__dirname,'../fixtures/metagame-schema.sql'),'utf8'));
 // Small adapter so the native Node test database exercises the production better-sqlite3 API.
 db.transaction=fn=>{const tx=(...args)=>{db.exec('BEGIN IMMEDIATE');try{const r=fn(...args);db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};tx.immediate=tx;return tx;};
 return db;
}
module.exports={database};
