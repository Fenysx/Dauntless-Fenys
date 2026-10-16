'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/Diagnosticar-Tailscale.ps1'),'utf8');
test('diagnostico Windows le status VPN e as portas do host, sem segredos',()=>{
 assert.match(source,/tailscale\.exe/);
 assert.match(source,/status --json/);
 assert.match(source,/61000/);
 assert.match(source,/61001/);
 assert.match(source,/\/launcher\/google\/status/);
 assert.match(source,/\[PENDENTE\]/);
 assert.doesNotMatch(source,/Get-Content\s+.*(?:\.env|\.key|authorization|undaunted\.db)/i);
 assert.doesNotMatch(source,/\b(?:git push|Set-NetFirewallRule|New-NetFirewallRule|Remove-Item)\b/i);
});
