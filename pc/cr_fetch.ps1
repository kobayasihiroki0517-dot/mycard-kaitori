# カードラッシュ（cardrush.media）の買取価格一覧（スタンダード全件）を取得して、
# Googleドライブの「MyCard買取表\POS取込」フォルダに cardrush.csv として保存する。
# カードラッシュはGoogle・GitHubからの取得を拒否するため、お店のパソコンで取得して受け渡す。
# スプレッドシートの自動更新（毎日12時台）がこのCSVを読み込みます。
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$log = Join-Path $PSScriptRoot 'cr_fetch.log'
function Log($m) { $line = (Get-Date -Format 'yyyy/MM/dd HH:mm:ss') + '  ' + $m; Write-Host $line; Add-Content -Path $log -Value $line -Encoding UTF8 }

try {
  # 保存先：Googleドライブ（パソコン版）の マイドライブ\MyCard買取表\POS取込
  $dest = $null
  foreach ($d in Get-PSDrive -PSProvider FileSystem) {
    foreach ($md in @('マイドライブ', 'My Drive')) {
      $p = Join-Path $d.Root ($md + '\MyCard買取表\POS取込')
      if (Test-Path $p) { $dest = $p; break }
    }
    if ($dest) { break }
  }
  if (-not $dest) { throw 'Googleドライブの「マイドライブ\MyCard買取表\POS取込」フォルダが見つかりません（パソコン版Googleドライブが起動しているか確認してください）' }

  $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  $base = 'https://cardrush.media/pokemon/buying_prices?limit=500&display_category=%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%80%E3%83%BC%E3%83%89&page='

  # ページのHTMLを取る：① Windows標準の curl.exe → ② だめならEdge/Chromeを画面なしで起動して取得
  $browsers = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }
  $tmpHtml = Join-Path $env:TEMP 'cardrush_page.html'
  function Get-Html($url) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path $curl) {
      if (Test-Path $tmpHtml) { Remove-Item $tmpHtml -Force }
      & $curl -s -L --compressed --max-time 60 -A $ua -H 'Accept-Language: ja,en;q=0.8' -H 'Accept: text/html,application/xhtml+xml' -o $tmpHtml $url 2>$null
      if (Test-Path $tmpHtml) {
        $h = [IO.File]::ReadAllText($tmpHtml, [Text.Encoding]::UTF8)
        if ($h -match '__NEXT_DATA__') { return $h }
      }
    }
    foreach ($b in $browsers) {
      if (Test-Path $tmpHtml) { Remove-Item $tmpHtml -Force }
      $prof = Join-Path $env:TEMP 'cardrush_profile'
      $args = @('--headless=new', '--disable-gpu', '--no-first-run', ('--user-data-dir="' + $prof + '"'), ('--user-agent="' + $ua + '"'), '--virtual-time-budget=15000', '--dump-dom', ('"' + $url + '"'))
      $p = Start-Process -FilePath $b -ArgumentList $args -RedirectStandardOutput $tmpHtml -NoNewWindow -PassThru -Wait
      if (Test-Path $tmpHtml) {
        $h = [IO.File]::ReadAllText($tmpHtml, [Text.Encoding]::UTF8)
        if ($h -match '__NEXT_DATA__') { return $h }
      }
    }
    throw 'カードラッシュのページを取得できませんでした（curl・ブラウザとも）'
  }

  function Get-Page($n) {
    for ($t = 1; $t -le 3; $t++) {
      try {
        $html = Get-Html ($base + $n)
        $m = [regex]::Match($html, '<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>')
        if (-not $m.Success) { throw 'カードラッシュのページ形式が変わった可能性があります' }
        return ($m.Groups[1].Value | ConvertFrom-Json).props.pageProps
      } catch {
        if ($t -eq 3) { throw }
        Log ("  {0}ページ目の取得に失敗。{1}秒後に再試行: {2}" -f $n, (15 * $t), $_.Exception.Message)
        Start-Sleep -Seconds (15 * $t)
      }
    }
  }

  $first = Get-Page 1
  $items = New-Object System.Collections.ArrayList
  $first.buyingPrices | ForEach-Object { [void]$items.Add($_) }
  $last = [int]$first.lastPage
  for ($p = 2; $p -le $last; $p++) {
    Start-Sleep -Seconds 2
    (Get-Page $p).buyingPrices | ForEach-Object { [void]$items.Add($_) }
  }
  if ($items.Count -lt 100) { throw ("取得件数が少なすぎます（{0}件）" -f $items.Count) }

  $rows = $items | ForEach-Object {
    [pscustomobject]@{
      pack_code = $_.pack_code; model_number = $_.model_number; name = $_.name
      extra_difference = $_.extra_difference; rarity = $_.rarity; amount = $_.amount; updated_at = $_.updated_at
    }
  }
  $tmp = Join-Path $env:TEMP 'cardrush.csv'
  $rows | Export-Csv -Path $tmp -NoTypeInformation -Encoding UTF8
  Copy-Item -Path $tmp -Destination (Join-Path $dest 'cardrush.csv') -Force
  Log ("完了：{0}件を保存しました → {1}" -f $items.Count, (Join-Path $dest 'cardrush.csv'))
} catch {
  Log ('エラー：' + $_.Exception.Message)
  exit 1
}
