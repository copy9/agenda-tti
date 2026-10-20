# Instala tudo o que a Agenda TTI precisa no Windows para rodar local e fazer deploy.
# Como usar: abra o PowerShell DENTRO da pasta do projeto e rode:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
# Pode rodar de novo quando quiser: o que já está instalado é pulado.
$ErrorActionPreference = 'Continue'

function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Instala($cmd, $id, $nome) {
  if (Tem $cmd) { Write-Host "OK   $nome ja instalado"; return }
  Write-Host "...  instalando $nome"
  winget install --id $id -e --accept-source-agreements --accept-package-agreements
}

if (-not (Tem 'winget')) { Write-Host 'winget nao encontrado. Atualize o "Instalador de Aplicativo" na Microsoft Store e rode de novo.'; exit 1 }

Instala 'node'   'OpenJS.NodeJS.LTS'   'Node.js (LTS)'
Instala 'git'    'Git.Git'             'Git'
Instala 'gh'     'GitHub.cli'          'GitHub CLI'
Instala 'docker' 'Docker.DockerDesktop' 'Docker Desktop (deploy)'
Instala 'code'   'Microsoft.VisualStudioCode' 'VS Code'
Instala 'cloudflared' 'Cloudflare.cloudflared' 'Cloudflare Tunnel (link publico para teste)'

# o PATH novo so vale em terminais novos: recarrega nesta sessao
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

if (-not (Tem 'node')) { Write-Host 'Node foi instalado. FECHE este terminal, abra outro na pasta do projeto e rode o script de novo.'; exit 0 }

Write-Host '...  instalando dependencias do projeto'
npm install
Write-Host '...  instalando o navegador dos testes (Chromium)'
npx playwright install chromium

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'OK   .env criado a partir do .env.example. ABRA o .env e troque ADMIN_EMAIL e ADMIN_PASSWORD.'
}

Write-Host '...  rodando os testes'
npm test

Write-Host ''
Write-Host 'Pronto. Para rodar local:  npm.cmd start   (abre em http://127.0.0.1:3000)'
Write-Host 'Link publico de teste:     cloudflared tunnel --url http://127.0.0.1:3000'
Write-Host 'Deploy com Docker:         docker compose up -d --build   (veja README, secao 2)'
Write-Host 'Entrar no GitHub:          gh auth login'
