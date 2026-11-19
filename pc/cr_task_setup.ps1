# cr_fetch.ps1 を「毎日 11:40」に自動で動かす設定（Windowsのタスクスケジューラに登録）し、今すぐ1回取得する。
# パソコンが11:40に起動していなかった場合は、次に起動したときに実行されます。
$script = Join-Path $PSScriptRoot 'cr_fetch.ps1'
try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"')
  $trigger = New-ScheduledTaskTrigger -Daily -At '11:40'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
  Register-ScheduledTask -TaskName 'MyCard_cardrush' -Action $action -Trigger $trigger -Settings $settings -Description 'カードラッシュの買取価格一覧をGoogleドライブに保存（MyCard買取表）' -Force -ErrorAction Stop | Out-Null
  Write-Host '登録しました：毎日 11:40 に自動で取得します（タスク名 MyCard_cardrush）。' -ForegroundColor Green
} catch {
  Write-Host ('自動実行の登録に失敗しました：' + $_.Exception.Message) -ForegroundColor Yellow
  Write-Host '（取得だけは続けて行います。この画面をスクリーンショットで送ってください）' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '今すぐ1回取得します（1分ほどかかります）...'
try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script } catch { Write-Host ('エラー：' + $_.Exception.Message) -ForegroundColor Red }
Write-Host ''
Write-Host '終わりました。この画面は閉じて大丈夫です。' -ForegroundColor Green
Read-Host 'Enterキーで閉じます'
