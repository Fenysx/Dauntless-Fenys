# Dauntless Launcher Ultimate - diagnostico Tailscale somente leitura.
# Nao coleta tokens, senhas, chaves, arquivos .env ou banco do jogo.
param([switch]$SaveReport)
$ErrorActionPreference='Continue'
$rows=New-Object System.Collections.Generic.List[string]
function Add-Report([string]$message){
 Write-Host $message
 [void]$rows.Add($message)
}
function Check-Port([string]$hostName,[int]$port){
 $client=New-Object System.Net.Sockets.TcpClient
 try{
  $wait=$client.BeginConnect($hostName,$port,$null,$null)
  if(-not $wait.AsyncWaitHandle.WaitOne(2500)){return $false}
  $client.EndConnect($wait)
  return $true
 }catch{return $false}finally{$client.Close()}
}
Add-Report 'DAUNTLESS LAUNCHER ULTIMATE - DIAGNOSTICO TAILSCALE'
Add-Report ('Data: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
$tail=''
$command=Get-Command tailscale.exe -ErrorAction SilentlyContinue
if($command){$tail=$command.Source}
elseif(Test-Path (Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe')){$tail=Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'}
if(-not $tail){
 Add-Report '[FALHA] Tailscale nao localizado neste Windows.'
}else{
 try{
  $state= & $tail status --json 2>$null | Out-String | ConvertFrom-Json
  if($state.BackendState -eq 'Running'){
   $ipv4=@($state.Self.TailscaleIPs | Where-Object {$_ -match '^100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d{1,3}\.\d{1,3}$'})
   Add-Report ('[OK] Tailscale em execucao. Endereco privado: '+ $(if($ipv4.Count){$ipv4[0]}else{'NAO ENCONTRADO'}))
  }else{Add-Report ('[FALHA] Tailscale: '+$state.BackendState+'. Abra o Tailscale e entre na conta.')}
 }catch{Add-Report '[FALHA] Tailscale nao respondeu ao comando status.'}
}
foreach($port in @(61000,61001)){
 $open=Check-Port '127.0.0.1' $port
 Add-Report ($(if($open){'[OK]'}else{'[FALHA]'})+' TCP localhost:'+ $port+$(if($open){' acessivel.'}else{' nao responde.'}))
}
try{
 $uri='http://127.0.0.1:61000/launcher/google/status'
 $response=Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
 $json=$response.Content | ConvertFrom-Json
 if($json.mode -eq 'google' -and $json.registered -eq $true){
  Add-Report '[OK] Metagame confirma host Google integrado e registrado.'
 }else{Add-Report '[PENDENTE] TCP responde, mas a integracao Google nao esta confirmada.'}
}catch{Add-Report '[PENDENTE] Rota Google nao respondeu corretamente. Atualize/integrar Metagame antes de gerar convites.'}
if($SaveReport){
 $file=Join-Path $env:TEMP 'Dauntless-Tailscale-Diagnostico.txt'
 $rows | Set-Content -Path $file -Encoding UTF8
 Write-Host ('Relatorio salvo em: '+$file)
}
Write-Host 'Este diagnostico local NAO confirma acesso no PC do amigo nem portas UDP de Ramsgate.'
