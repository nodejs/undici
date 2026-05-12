$testScripts = @(
  'test:cache',
  'test:cache-interceptor',
  'test:cache-tests',
  'test:cookies',
  'test:eventsource',
  'test:fetch',
  'test:infra',
  'test:interceptors',
  'test:jest',
  'test:node-fetch',
  'test:node-test',
  'test:subresource-integrity',
  'test:unit',
  'test:websocket',
  'test:wpt'
)

$commandIndex = -1
for ($i = 0; $i -lt $args.Length; $i++) {
  if ($args[$i] -ieq '/c' -or $args[$i] -ieq '-c') {
    $commandIndex = $i
    break
  }
}

if ($args.Length -eq 0 -or $commandIndex -eq $args.Length - 1) {
  exit 1
}

if ($commandIndex -eq -1) {
  $command = $args -join ' '
} else {
  $command = $args[($commandIndex + 1)..($args.Length - 1)] -join ' '
}
$shouldRetry = $testScripts -contains $env:npm_lifecycle_event

cmd.exe /d /s /c $command
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0 -or -not $shouldRetry) {
  exit $exitCode
}

Write-Host "Command failed with exit code $exitCode. Retrying once on Windows with Node.js 24."

cmd.exe /d /s /c $command
exit $LASTEXITCODE
