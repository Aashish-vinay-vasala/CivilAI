# Builds frontend/ (Next.js static export) and deploys it to Firebase Hosting.
# No Docker involved — firebase.json already points hosting at the `out/` export dir.
#
# Prereqs:
#   - firebase CLI authenticated (firebase login) with access to gen-lang-client-0881995245
#   - frontend/.env.production has NEXT_PUBLIC_API_URL set to the deployed Cloud Run
#     backend URL (run deploy-backend.ps1 first and copy its printed URL in)
#
# Usage: pwsh deploy/deploy-frontend.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "gen-lang-client-0881995245"

$RepoRoot    = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $RepoRoot "frontend"

Push-Location $FrontendDir
try {
    Write-Host "Installing dependencies ..."
    pnpm install --frozen-lockfile

    Write-Host "Building static export (next build, output: 'export') ..."
    pnpm build

    Write-Host "Deploying to Firebase Hosting ($ProjectId) ..."
    firebase deploy --only hosting --project $ProjectId
}
finally {
    Pop-Location
}
