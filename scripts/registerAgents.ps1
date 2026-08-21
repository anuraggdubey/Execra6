# Execra Script
$agents = @(
    @("coding_agent", "coding"),
    @("github_agent", "github"),
    @("document_agent", "document"),
    @("email_agent", "email"),
    @("websearch_agent", "websearch"),
    @("browser_agent", "browser")
)

$REGISTRY = "CB7GWIZCNU2UUGMF53VEMI5QHKXCWGXEJKXYP3RVEOG66SC3W7USNMPY"
$SECRET = "SAMQSYVAJ4DXNJUP2EDCJBU5ISFJCWJX6FA4ORV4CHKW6BSGDSZAITEI"
$ADMIN = "GDBUNBHJO2R4B3KDAGDBQXC2ZCUCZTIMAAATA4OUOCBQQ3LUETFZHR3V"

foreach ($a in $agents) {
    $agentId = $a[0]
    $agentType = $a[1]
    Write-Host "Registering $agentId ($agentType)..."
    stellar contract invoke --id $REGISTRY --source-account $SECRET --network testnet -- register_agent --admin $ADMIN --agent_id $agentId --agent_type $agentType --wallet_address $ADMIN
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAILED to register $agentId" -ForegroundColor Red
    } else {
        Write-Host "OK: $agentId" -ForegroundColor Green
    }
}
Write-Host "`nAll agents registered."
