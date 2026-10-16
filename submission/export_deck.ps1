param([string]$Pptx, [string]$Png, [string]$Pdf)
$ErrorActionPreference = "Stop"
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($Pptx, $true, $false, $false)
if ($Png) {
    New-Item -ItemType Directory -Force $Png | Out-Null
    $pres.Export($Png, "PNG", 1600, 900)
}
if ($Pdf) {
    $pres.SaveAs($Pdf, 32)
}
$pres.Close()
$app.Quit()
