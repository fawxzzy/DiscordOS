# DiscordOS Mazer Four-Card Normalization Rerun

Run this packet only after the lifecycle merge fix is merged to `main` and the canonical DiscordOS checkout is updated. Run it from the DiscordOS repository root. It plans against fresh Discord history but selects and mutates only the four blocked Mazer cards from `mazer-normalization-2026-07-14`.

```powershell
$ErrorActionPreference = "Stop"
$sourceRun = Resolve-Path "..\..\runtime\board-integrity\mazer-normalization-2026-07-14"
$retryRun = Join-Path $sourceRun "post-merge-four-card-rerun"
New-Item -ItemType Directory -Force -Path $retryRun | Out-Null

$expected = @{
  "1524974571059675198" = @{ cardId = "mazer-auth-gate-persistent-login"; state = "in_progress" }
  "1524974583348858880" = @{ cardId = "mazer-discordos-board-discipline"; state = "in_progress" }
  "1525635672961060925" = @{ cardId = "mazer-auth-ui-flow-hardening"; state = "planning" }
  "1526644909241667644" = @{ cardId = "mazer-shared-run-status-panel"; state = "planning" }
}
$eventPath = Join-Path $retryRun "four-events.json"
$allEventPath = Join-Path $retryRun "all-events.json"
$planResultPath = Join-Path $retryRun "plan-result.json"

npm run --silent ops:production-env:run -- node scripts/discordos-board-card-migration-plan.js --json --boards (Join-Path $sourceRun "06-mazer-board-scope.json") --mazer-board (Join-Path $sourceRun "03-mazer-owner-snapshot.json") --output $allEventPath | Set-Content -Encoding utf8 $planResultPath
$planExit = $LASTEXITCODE
$plan = Get-Content -Raw $planResultPath | ConvertFrom-Json
$targetRows = @($plan.rows | Where-Object { $expected.ContainsKey([string]$_.threadId) })
if ($targetRows.Count -ne 4) { throw "Expected exactly four target planner rows." }
foreach ($row in $targetRows) {
  if (-not $row.eventCreated -or $row.matchedBy -ne "source_thread_id" -or @($row.reasonCodes).Count -ne 0) {
    throw "Target planner admission failed for thread $($row.threadId)."
  }
  if ($row.journalIdentityDecision.exactSourceThreadIdentity -ne $true) {
    throw "Exact source-thread identity was not proven for thread $($row.threadId)."
  }
  if ($row.journalIdentityDecision.decision -notin @("legacy_identity_omission_admitted", "mixed_explicit_match_and_legacy_omission_admitted", "explicit_identity_match")) {
    throw "Journal identity was not safely admitted for thread $($row.threadId)."
  }
}

# Other board rows may remain blocked by the intentionally strict non-exact identity gate.
# This packet selects only the four exact-thread events proven above.
if ($planExit -ne 0 -and $plan.status -ne "blocked") { throw "Migration planning failed unexpectedly." }

$allEvents = @((Get-Content -Raw $allEventPath | ConvertFrom-Json).events)
$selectedEvents = @($allEvents | Where-Object { $expected.ContainsKey([string]$_.card.threadId) })
if ($selectedEvents.Count -ne 4) { throw "Expected exactly four selected migration events." }
foreach ($event in $selectedEvents) {
  $row = $expected[[string]$event.card.threadId]
  if ($event.card.id -ne $row.cardId) { throw "Card identity mismatch for thread $($event.card.threadId)." }
  if ($event.card.state -ne $row.state) { throw "Lifecycle was not preserved for $($event.card.id)." }
  if ($null -ne $event.card.previousState) { throw "Normalization unexpectedly declared a lifecycle transition for $($event.card.id)." }
}
$eventPayload = @{ events = $selectedEvents } | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($eventPath, $eventPayload + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))

$dryRunPath = Join-Path $retryRun "dry-run.json"
npm run --silent ops:production-env:run -- node scripts/discordos-board-card-journal.js --json --input $eventPath --dry-run | Set-Content -Encoding utf8 $dryRunPath
if ($LASTEXITCODE -ne 0) { throw "Four-card dry-run failed." }
$dryRun = Get-Content -Raw $dryRunPath | ConvertFrom-Json
if (-not $dryRun.ok -or $dryRun.eventCount -ne 4 -or @($dryRun.results | Where-Object { -not $_.ok }).Count -ne 0) { throw "Four-card dry-run did not pass exactly." }

$applyPath = Join-Path $retryRun "guarded-apply.json"
$env:DISCORDOS_BOARD_CARD_JOURNAL = "enabled"
try {
  npm run --silent ops:production-env:run -- node scripts/discordos-board-card-journal.js --json --input $eventPath --allow-apply --apply | Set-Content -Encoding utf8 $applyPath
  if ($LASTEXITCODE -ne 0) { throw "Four-card guarded apply failed." }
} finally {
  Remove-Item Env:DISCORDOS_BOARD_CARD_JOURNAL -ErrorAction SilentlyContinue
}
$apply = Get-Content -Raw $applyPath | ConvertFrom-Json
if (-not $apply.ok -or $apply.status -ne "journaled" -or $apply.eventCount -ne 4 -or @($apply.results | Where-Object { -not $_.readback.starter -or -not $_.readback.journal }).Count -ne 0) { throw "Four-card apply/readback did not pass exactly." }

$readbackPath = Join-Path $retryRun "mazer-exact-readback.json"
npm run --silent ops:production-env:run -- node scripts/discordos-mazer-feedback-board-live-readback.js --json | Set-Content -Encoding utf8 $readbackPath
if ($LASTEXITCODE -ne 0) { throw "Mazer exact readback failed." }
$readback = Get-Content -Raw $readbackPath | ConvertFrom-Json
$exactRows = @($readback.rows | Where-Object { $expected.ContainsKey([string]$_.threadId) })
if ($exactRows.Count -ne 4) { throw "Exact readback did not return all four threads." }
foreach ($row in $exactRows) {
  $wanted = $expected[[string]$row.threadId]
  if (-not $row.ok -or $row.cardId -ne $wanted.cardId -or $row.liveState -ne $wanted.state) { throw "Exact readback failed for thread $($row.threadId)." }
}

$registryPath = Join-Path $retryRun "final-registry-scan.json"
npm run --silent ops:production-env:run -- node scripts/discordos-board-card-consistency.js --json --registry config/discordos-board-registry.json | Set-Content -Encoding utf8 $registryPath
$registryExit = $LASTEXITCODE
$registry = Get-Content -Raw $registryPath | ConvertFrom-Json
$fourRegistryRows = @($registry.rows | Where-Object { $expected.ContainsKey([string]$_.threadId) })
if ($fourRegistryRows.Count -ne 4 -or @($fourRegistryRows | Where-Object { -not $_.ok }).Count -ne 0) { throw "Final registry scan did not clear all four cards." }
$mazerRows = @($registry.rows | Where-Object { $_.boardId -eq "mazer-active" -and -not $_.superseded })
if ($mazerRows.Count -ne 65 -or @($mazerRows | Where-Object { -not $_.ok }).Count -ne 0) { throw "Final Mazer registry scan is not 65 healthy / 0 drifted." }

[pscustomobject]@{
  status = "four_card_normalization_complete"
  planned = $selectedEvents.Count
  dryRun = $dryRun.results.Count
  applied = $apply.results.Count
  exactReadback = $exactRows.Count
  mazerHealthy = @($mazerRows | Where-Object { $_.ok }).Count
  mazerDrifted = @($mazerRows | Where-Object { -not $_.ok }).Count
  registryStatus = $registry.status
  registryExitCode = $registryExit
} | ConvertTo-Json
```

The final registry command may retain a nonzero exit code while unrelated required board admissions remain blocked. The packet accepts that global status only after proving all four target rows healthy and the Mazer board at `65 healthy / 0 drifted`.
