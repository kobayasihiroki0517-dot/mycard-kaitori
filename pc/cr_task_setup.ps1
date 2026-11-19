# cr_fetch.ps1 を「毎日 11:40」に自動で動かす設定（Windowsのタスクスケジューラに登録）。
# パソコンが11:40に起動していなかった場合は、次に起動したときに実行されます。
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'cr_fetch.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"')
$trigger = New-ScheduledTaskTrigger -Daily -At '11:40'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'MyCard カードラッシュ取得' -Action $action -Trigger $trigger -Settings $settings -Description 'カードラッシュの買取価格一覧をGoogleドライブに保存（MyCard買取表）' -Force | Out-Null
Write-Host '登録しました：毎日 11:40 に「MyCard カードラッシュ取得」を実行します。' -ForegroundColor Green
Write-Host '今すぐ1回取得します...'
& $script
Write-Host ''
Write-Host 'このウィンドウは閉じて大丈夫です。' -ForegroundColor Green
Read-Host 'Enterキーで閉じます'
