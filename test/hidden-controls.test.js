'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..','src',name),'utf8');
test('qualquer elemento com hidden fica invisivel mesmo se .btn definir display',()=>{
 const css=read('style.css');
 assert.match(css,/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/);
 assert.match(css,/\.btn\s*\{[^}]*display\s*:\s*inline-flex/);
});
test('tela Google oculta controles de login e vinculo quando nao aplicaveis',()=>{
 const html=read('index.html'),renderer=read('renderer.js');
 for(const id of ['google-cancel','google-logout','google-link','google-linked-help']){
  assert.match(html,new RegExp('id="'+id+'"[^>]*hidden'));
 }
 assert.match(renderer,/\$\('google-login'\)\.hidden=r\.signedIn/);
 assert.match(renderer,/\$\('google-link-help'\)\.hidden=!r\.signedIn\|\|r\.linked/);
});
test('codigo privado para hospedar outro servidor nunca aparece em campo de texto simples',()=>{
 const html=read('index.html'),renderer=read('renderer.js');
 assert.match(html,/id="google-host-result"[^>]*type="password"|type="password"[^>]*id="google-host-result"/);
 assert.match(html,/id="google-host-code-copy"/);
 assert.match(renderer,/\$\('google-host-code-copy'\)\.addEventListener\('click'/);
});
