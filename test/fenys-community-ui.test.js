'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');
const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
const section=id=>{
 const start=html.indexOf('id="screen-'+id+'"');
 const end=html.indexOf('</section>',start);
 assert.ok(start>=0&&end>start,'seção '+id+' não encontrada');
 return html.slice(start,end);
};
test('seleção de servidor contém somente tarefas de jogador, sem painel administrativo',()=>{
 const playing=section('connection'),settings=section('settings');
 for(const id of ['server-local-select','community-catalog','community-server-list','community-host-setup-open'])
  assert.ok(playing.includes('id="'+id+'"'),'falta '+id);
 assert.ok(!playing.includes('id="google-host-tools"'),'não colocar configurações administrativas na lista de servidores');
 assert.ok(settings.includes('id="google-host-tools"'),'hospedagem deve ficar em Configurações');
 assert.ok(settings.includes('id="community-host-readiness"'),'o host precisa mostrar o requisito HTTPS');
 assert.ok(settings.includes('id="legacy-network-settings"'),'configuração de endereço antigo permanece acessível como avançada');
 assert.match(renderer,/function openHostSettings\(/);
 assert.match(renderer,/\$\('community-host-setup-open'\)\.addEventListener\('click',openHostSettings\)/);
});
test('IDs únicos e controles legados preservados para compatibilidade do renderer',()=>{
 for(const id of ['google-host-tools','community-host-readiness','community-host-setup-open','community-publish','community-owner-server','connection-local','server-local-select']){
  const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
  assert.equal(matches.length,1,id+' precisa existir uma vez');
 }
 assert.match(section('connection'),/id="tailscale-tools" hidden/);
 assert.match(section('settings'),/Hospedar um servidor — integração Google e comunidade/);
 assert.ok(!section('settings').includes('A conexão exige Tailscale'));
});
