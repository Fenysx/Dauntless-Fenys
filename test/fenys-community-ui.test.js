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
test('seleção de servidor exibe somente jogador; hospedagem permanece em área própria',()=>{
 const playing=section('connection'),settings=section('settings'),hosting=section('host');
 for(const id of ['server-local-select','community-catalog','community-server-list','guest-network-auto'])
  assert.ok(playing.includes('id="'+id+'"'),'falta '+id);
 assert.ok(!playing.includes('id="google-host-activate"'),'não exibir host Google na seleção de servidor');
 for(const id of ['community-host-readiness','host-publish-form','host-invite-section','google-host-activate'])
  assert.ok(hosting.includes('id="'+id+'"'),'requisito de hospedagem não disponível: '+id);
 assert.ok(!settings.includes('id="community-publish"'),'não poluir preferências com publicação');
 assert.ok(!settings.includes('id="legacy-network-settings"'),'configuração manual antiga foi retirada');
 assert.ok(settings.includes('id="legacy-account-settings"'),'recuperação de personagem antigo deve permanecer');
 assert.match(renderer,/function openHostSettings\(/);
 assert.match(renderer,/setScreen\('host'\)/);
 assert.doesNotMatch(playing,/id="community-host-setup-open"/);
 assert.match(renderer,/\$\('dashboard-open-host'\)\.addEventListener\('click'/);
 assert.ok(html.includes('id="host-start"')&&html.includes('id="host-play"')&&html.includes('id="host-stop"'));
});
test('IDs únicos e somente fluxos novos permanecem na interface',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs duplicados');
 for(const id of ['screen-host','community-host-readiness','dashboard-open-host','community-publish',
  'community-owner-server','server-local-select','admin-server-settings']){
  assert.ok(ids.includes(id),'falta '+id);
 }
 assert.doesNotMatch(section('connection'),/id="tailscale-tools"|id="host-invite-tools"|id="legacy-code-tools"/);
 assert.doesNotMatch(section('host'),/value="vip"|value="tailscale"/);
 assert.match(section('host'),/id="host-maintenance-tools"/);
 assert.ok(!section('settings').includes('A conexão exige Tailscale'));
});
