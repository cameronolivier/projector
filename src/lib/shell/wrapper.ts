import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'

export type ShellKind = 'zsh' | 'bash' | 'fish' | 'powershell' | 'unknown'

export interface InstallResult {
  rcPath: string
  backupPath: string
  updated: boolean
}

export function detectShell(): ShellKind {
  if (process.platform === 'win32') return 'powershell'
  const shell = process.env.SHELL || ''
  if (shell.includes('zsh')) return 'zsh'
  if (shell.includes('bash')) return 'bash'
  if (shell.includes('fish')) return 'fish'
  return 'unknown'
}

export async function findRcCandidates(shell: ShellKind): Promise<string[]> {
  const home = os.homedir()
  const candidates: string[] = []
  const pushIfExists = async (p: string) => {
    try { await fs.stat(p); candidates.push(p) } catch {}
  }
  if (shell === 'powershell' || (process.platform === 'win32' && shell === 'unknown')) {
    await pushIfExists(path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'))
    await pushIfExists(path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'))
  }
  if (shell === 'zsh' || shell === 'unknown') {
    await pushIfExists(path.join(home, '.zshrc'))
  }
  if (shell === 'bash' || shell === 'unknown') {
    await pushIfExists(path.join(home, '.bashrc'))
    await pushIfExists(path.join(home, '.bash_profile'))
    await pushIfExists(path.join(home, '.profile'))
  }
  if (shell === 'fish' || shell === 'unknown') {
    await pushIfExists(path.join(home, '.config', 'fish', 'config.fish'))
  }
  return Array.from(new Set(candidates))
}

export function getWrapperForShell(shell: ShellKind, sentinel = '__PROJECTOR_CD__'): string | null {
  const bashZsh = [
    'function projector() {',
    '  local out',
    '  out="$(command projector \"$@\")" || return',
    '  case "$out" in',
    `    *${sentinel}\\ * ) cd "\${out##*${sentinel} }" ;;`,
    '    *) printf "%s\\n" "$out" ;;',
    '  esac',
    '}',
  ].join('\n')

  const fish = [
    'function projector; set out (command projector $argv);',
    '  if test (string match -q "' + sentinel + '*" -- $out);',
    '    set p (string split -m1 "' + sentinel + ' " -- $out)[2];',
    '    cd $p;',
    '  else;',
    '    printf "%s\\n" $out;',
    '  end;',
    'end',
  ].join('\n')

  const ps = [
    'function projector {',
    '  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)',
    '  $exe = (Get-Command projector -CommandType Application -ErrorAction SilentlyContinue)',
    '  if (-not $exe) { Write-Error \"projector binary not found on PATH\"; return }',
    '  $out = & $exe.Source @Args',
    '  if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }',
    '  if ($null -ne $out -and $out -is [array]) { $out = $out -join "`n" }',
    `  $sentinel = '${sentinel} '`,
    '  $idx = $out.LastIndexOf($sentinel)',
    '  if ($idx -ge 0) {',
    '    $path = $out.Substring($idx + $sentinel.Length).Trim()',
    '    if ($path) { Set-Location $path; return }',
    '  }',
    '  if ($null -ne $out) { Write-Output $out }',
    '}',
  ].join('\n')

  if (shell === 'powershell') return ps
  if (shell === 'fish') return fish
  if (shell === 'zsh' || shell === 'bash') return bashZsh
  return bashZsh
}

export async function installWrapperInto(rcPath: string, content: string): Promise<InstallResult> {
  const begin = '# >>> projector wrapper >>>'
  const end = '# <<< projector wrapper <<<'
  const exists = await fileExists(rcPath)
  if (!exists) throw new Error(`Shell rc file not found: ${rcPath}`)

  const original = await fs.readFile(rcPath, 'utf8')
  const backupPath = `${rcPath}.bak-${Date.now()}`
  await fs.copyFile(rcPath, backupPath)

  // Always strip any existing wrapper block(s), then append a fresh one idempotently
  const withoutBlock = stripWrapperBlocks(original).updated.trimEnd()
  const updatedContent = `${withoutBlock}\n\n${begin}\n${content}\n${end}\n`

  await fs.writeFile(rcPath, updatedContent, 'utf8')
  return { rcPath, backupPath, updated: true }
}

export async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

export function shortenHome(p: string): string {
  const home = os.homedir()
  return p.startsWith(home) ? p.replace(home, '~') : p
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripWrapperBlocks(content: string): { updated: string; removedCount: number } {
  const begin = '# >>> projector wrapper >>>'
  const end = '# <<< projector wrapper <<<'
  let removedCount = 0
  let updated = content
  for (;;) {
    const start = updated.indexOf(begin)
    if (start === -1) break
    const endIdx = updated.indexOf(end, start)
    if (endIdx === -1) break
    updated = updated.slice(0, start) + updated.slice(endIdx + end.length)
    removedCount += 1
  }
  return { updated: updated.trimEnd() + '\n', removedCount }
}
