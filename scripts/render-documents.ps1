# Native Word fallback for a Windows host without LibreOffice.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$wordRoot = Join-Path $taskRoot 'docs\word'
$qaRoot = Join-Path $taskRoot '.data\document-qa'
New-Item -ItemType Directory -Force -Path $qaRoot | Out-Null
$wordApp = New-Object -ComObject Word.Application
$wordApp.Visible = $false
$wordApp.DisplayAlerts = 0
$wordApp.AutomationSecurity = 3
try {
  Get-ChildItem -LiteralPath $wordRoot -Filter '*.docx' | ForEach-Object {
    $document = $wordApp.Documents.Open($_.FullName, $false, $true)
    try {
      $pdfPath = Join-Path $qaRoot ($_.BaseName + '.pdf')
      $document.ExportAsFixedFormat($pdfPath, 17)
      Write-Output ('Rendered ' + $_.Name)
    } finally { $document.Close(0) }
  }
} finally { $wordApp.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp) | Out-Null }
