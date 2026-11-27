Add-Type -AssemblyName System.Drawing

$dest = Join-Path $PSScriptRoot 'app\public\images\icons'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

function New-Icon($size, $maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAlias'

  if ($maskable) {
    # fundo ocupa 100% (safe zone: conteúdo nos 80% centrais)
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,0,177,197))
    $g.FillRectangle($bg, 0, 0, $size, $size)
  } else {
    # raio arredondado
    $r = [int]($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, 2*$r, 2*$r, 180, 90)
    $path.AddArc($size-2*$r, 0, 2*$r, 2*$r, 270, 90)
    $path.AddArc($size-2*$r, $size-2*$r, 2*$r, 2*$r, 0, 90)
    $path.AddArc(0, $size-2*$r, 2*$r, 2*$r, 90, 90)
    $path.CloseFigure()
    $g.Clear([System.Drawing.Color]::Transparent)
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,0,177,197))
    $g.FillPath($bg, $path)
  }

  # texto "+" centralizado dentro da safe zone
  $propFont = if ($maskable) { 0.55 } else { 0.62 }
  $font = New-Object System.Drawing.Font ('Segoe UI', [float]($size * $propFont), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $branco = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $fmt.LineAlignment = 'Center'
  $propRect = if ($maskable) { 0.90 } else { 1.0 }
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, ($size * $propRect)
  $g.DrawString('+', $font, $branco, $rect, $fmt)

  $g.Dispose()
  $nome = if ($maskable) { "icon-$size-maskable.png" } else { "icon-$size.png" }
  $bmp.Save((Join-Path $dest $nome), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 $false
New-Icon 512 $false
New-Icon 192 $true
New-Icon 512 $true
Get-ChildItem $dest
