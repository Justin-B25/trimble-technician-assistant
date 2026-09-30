# Regenerate TMC Bench Crane Assembly Guide (Word)
# Requires: Python 3 + pip install python-docx json5

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
python "$root\scripts\generate-docx.py"
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Open: $root\TMC-Bench-Crane-Assembly-Guide.docx"
}
