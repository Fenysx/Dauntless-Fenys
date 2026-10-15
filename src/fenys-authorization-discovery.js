'use strict';
// Find a previously generated authorization without copying or displaying its secrets.
const fs=require('node:fs'),path=require('node:path');
const {validateAuthorization}=require('./fenys-supabase');
function findAuthorizationFile(home,selected){
 const candidates=[
  selected,
  path.join(home,'Dauntless-Fenys-Atualizado','runtime','cloud-enrollment','authorization.json'),
  path.join(home,'Dauntless-Fenys','runtime','cloud-enrollment','authorization.json')
 ];
 for(const file of new Set(candidates.filter(x=>typeof x==='string'&&x.trim()))){
  try{
   if(!fs.statSync(file).isFile())continue;
   validateAuthorization(JSON.parse(fs.readFileSync(file,'utf8')));
   return file;
  }catch{} // Missing or invalid files cannot unlock host activation.
 }
 return null;
}
module.exports={findAuthorizationFile};
