$ErrorActionPreference = 'Stop'
$arq = 'app\public\js\app.js'
$t = [IO.File]::ReadAllText($arq)
$marcador = 'async function sair() {'
$i = $t.IndexOf($marcador)
$j = $t.IndexOf('// ==================== LOGIN', $i)
if ($i -lt 0 -or $j -lt 0) { throw 'marcadores nao encontrados' }
# mantém tudo até o fim da função sair (que termina com "location.hash = '#/login';`n}")
$fimSair = $t.IndexOf("location.hash = '#/login';", $i)
$fimSair = $t.IndexOf('}', $fimSair) + 1
$novo = $t.Substring(0, $fimSair) + "`n`n" + $t.Substring($j)
[IO.File]::WriteAllText($arq, $novo, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'corrigido'
