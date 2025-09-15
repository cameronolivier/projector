status: done

# 0013 Interactive Actions from Table (Open, CD) with Shell Wrapper — Completion (Continued)

Completion Summary

- Interactive action flow finalized: selection + actions work reliably in TTY.
- Sentinel unified: wrappers and CLI share `config.cdSentinel` consistently.
- Tests added: interactive gating, cd emission, editor spawn, shell dry-run/install/remove with idempotency and backups.
- Docs updated: architecture flow, README snippets for bash/zsh, fish, PowerShell, and `projector shell` usage including `--dry-run` and `--remove`.
- Regex hardened for removal path; whitespace and exit codes polished.

Note: The remainder is preserved as historical planning reference.

## Context Recap

- Core feature works: interactive action flow in `list` (TTY gating, editor open, cd sentinel emission), shell wrapper generation for bash/zsh, fish, PowerShell, and idempotent install/remove with backups.
- Sentinel alignment is implemented end-to-end via `config.cdSentinel`.
- Docs largely cover interactive flow and shell integration; ExecutionPolicy note is present for PowerShell.
- Unit tests cover wrappers and editor command mapping. Command-level interactive and shell flows still need dedicated tests.

## Gaps To Address

- List interactive flow tests: TTY gating, `--interactive`/`--no-interactive`, legacy `--select` interplay, cd emission, editor spawn usage.
- Shell command tests: dry-run for install/remove, real install idempotency and backups, remove path backups.
- Precedence clarity: document combined behavior of `--select` and interactive in README for transparency.
- Optional: whitespace handling assurance around sentinel emission (already safe by design, add focused assertion tests).

## Detailed Approach

### 1) Add Tests: `test/list-interactive-flow.test.ts`

Objectives:
- Validate gating logic under TTY and flags.
- Confirm cd action prints exactly `<sentinel> <abs-path>` and exits(0).
- Confirm open action uses `buildEditorCommand` result and spawns with expected arguments.

Plan:
- Mock TTY:
  - Temporarily override `process.stdout.isTTY` and `process.stdin.isTTY` to `true`/`false` within tests; restore after.
- Mock dependencies to avoid real scanning:
  - `jest.doMock('../src/lib/discovery/scanner', ...)` to return a fixed project list with absolute paths.
  - `jest.doMock('../src/lib/discovery/detector', ...)` to provide simple type detection.
  - `jest.doMock('../src/lib/tracking/analyzer', ...)` to provide deterministic status.
  - Optionally mock `CacheManager` if needed to bypass filesystem access.
- Mock prompts:
  - Stub `inquirer.prompt` to return sequential answers:
    - First prompt: `{ projectPath: '/abs/project' }`.
    - Second prompt: `{ action: 'cd' | 'open-default' | 'open-choose' }`.
    - For 'open-choose', a third prompt: `{ editor: 'code' }`.
- Capture output and exit behavior:
  - Spy on `Command.prototype.log` and `Command.prototype.warn` (or capture `process.stdout.write`).
  - Spy on `List.prototype.exit` to intercept exit codes without killing the test process; assert `exit(0)` for cd; `exit(130)` on cancel.
- Editor open case:
  - Spy on `child_process.spawn`. Stub `buildEditorCommand` via module mock to return `{ cmd: 'code', args: ['/abs/project'] }` and assert spawn called with these.

Test Cases:
- Interactive gating:
  - TTY true + default config: interactive flow runs.
  - `--no-interactive`: interactive flow disabled.
  - `--interactive`: forces interactive even if default disabled.
  - Non‑TTY: interactive flow does not run.
- cd action:
  - Asserts single line equals `<sentinel> <abs-path>` (no extra whitespace), then `exit(0)`.
- open-default and open-choose actions:
  - Asserts `spawn(cmd, args, ...)` called matching `buildEditorCommand` output.
- Legacy `--select` coexistence:
  - In a TTY, `--select` prints path, and interactive flow may follow (documented behavior). Assert selection still prints path and does not break the interactive flow gating; or if we decide to short-circuit later, update this test accordingly.

Notes:
- Keep mocks local to test file using `jest.isolateModules` if import order matters.
- Ensure test restores all globals and spies in `afterEach`.

Acceptance:
- New test file passes under CI, exercising cd emission and editor spawning paths.

### 2) Add Tests: `test/shell-command.test.ts`

Objectives:
- Validate `projector shell` behaviors for install/update/remove, and `--dry-run` outputs.
- Confirm idempotent install (replaces existing block) and backups for both install and remove.

Plan:
- Use a tmp directory and file per test via `fs.mkdtemp` and `path.join(os.tmpdir(), ...)`.
- Pre-seed rc file with minimal content `# test rc\nexport FOO=bar\n`.
- For install dry-run:
  - `await ShellCmd.run(['--install', '--dry-run', '--rc', tmpRcPath, '--shell', 'zsh'])`.
  - Capture stdout; assert printed block contains begin/end markers and wrapper body with configured sentinel.
- For actual install:
  - Run install twice; read rc file; assert exactly one projector block exists and content matches wrapper; assert `.bak-<ts>` backup created each time.
- For remove dry-run:
  - Ensure rc has a block (by writing or via prior install). Run with `--remove --dry-run` and assert the displayed block matches range extracted via escaped markers.
- For actual remove:
  - Run `--remove` and confirm wrapper block is removed; assert a backup file exists; confirm original rc content (minus block) remains with trailing newline.

Implementation Notes:
- App-level command testing:
  - Import `ShellCmd` and invoke `ShellCmd.run([...])`. Stub `detectShell` or pass `--shell` to avoid host detection dependency.
  - Mock `inquirer` only when needed (e.g., when rc candidates are resolved automatically). Prefer passing `--rc` to avoid prompts.
- Avoid network and external processes; all file I/O stays within tmp dirs.

Acceptance:
- New test file passes and demonstrates idempotent install, safe remove, and dry-run matching with escaped regex.

### 3) Document Precedence: `--select` vs Interactive

Objective:
- Make behavior explicit so users aren’t surprised when using legacy selection alongside the new flow.

Plan:
- In `README.md` under “Interactive Actions and cd-in-place”, add a short “Precedence” note:
  - Default: `--select` runs its path-selection prompt and output. The interactive flow may still run when in a TTY unless disabled with `--no-interactive`.
  - Tip: Use `--no-interactive` to limit behavior to `--select` only; use `--interactive` to force the new flow even if defaults or TTY differ.

Alternative (optional):
- If we choose to short-circuit interactive when `--select` is provided, update `list.ts` accordingly and update both docs and tests to reflect the new precedence.

Acceptance:
- README explicitly states precedence and provides a one-line tip to control behavior.

### 4) Sentinel Whitespace Assurance (Optional Tests)

Objective:
- Strengthen confidence that wrappers work even with varying whitespace/newlines from CLI output.

Plan:
- In `test/shell-wrapper.test.ts`, add assertions that the generated wrapper logic references the sentinel with a trailing space and that cd emission from CLI uses exactly one space separator. While we cannot execute fish/PowerShell here, ensuring the literal sentinel formatting is consistent is sufficient.

Acceptance:
- Tests assert sentinel usage is consistent: CLI prints `<sentinel> <abs-path>`; wrappers include logic that splits/matches on `<sentinel> `.

## Milestones & Estimates

- Tests — interactive list: 1.5–2.5 hours.
- Tests — shell command: 1.5–2 hours.
- Docs — precedence note: 15–20 minutes.
- Optional whitespace assertions: 15 minutes.

## Risks & Mitigations

- Oclif command testing friction: Prefer passing flags (`--rc`, `--shell`) to avoid prompts; mock `inquirer` when unavoidable.
- TTY simulation: Wrap overrides of `isTTY` and restore in `afterEach`; keep tests isolated using `isolateModules`.
- Platform-specific paths: Use `os.tmpdir()` and avoid platform-dependent assumptions in tests.

## Acceptance Criteria (Final)

- Interactive list flow tests cover gating, cd emission with exit(0), and editor spawning with `buildEditorCommand`.
- Shell command tests cover dry-run and real install/remove, idempotency, and backup creation.
- README documents precedence for `--select` vs interactive and how to control it via flags.
- Optional: Added assertions for sentinel whitespace consistency.

## Out of Scope

- ESLint v9 configuration migration. Current `lint:check` failure is unrelated to 0013 and can be addressed in a separate housekeeping task (pin ESLint v8 or add `eslint.config.js`).

## Appendix: Example Test Skeletons

```ts
// test/list-interactive-flow.test.ts (sketch)
import { jest } from '@jest/globals'
import * as child_process from 'child_process'

jest.mock('../src/lib/discovery/scanner', () => ({
  ProjectScanner: jest.fn().mockImplementation(() => ({
    scanDirectory: async () => [{ name: 'proj', path: '/abs/proj' }],
  })),
}))
jest.mock('../src/lib/discovery/detector', () => ({
  TypeDetector: jest.fn().mockImplementation(() => ({
    detectProjectType: () => 'nodejs',
    detectLanguages: () => ['ts'],
    hasGitRepository: () => true,
  })),
}))
jest.mock('../src/lib/tracking/analyzer', () => ({
  TrackingAnalyzer: jest.fn().mockImplementation(() => ({
    analyzeProject: async () => ({ type: 'active', details: '', confidence: 90 }),
    detectTrackingFiles: async () => [],
  })),
}))

describe('list interactive flow', () => {
  const realIsTTY = { out: process.stdout.isTTY, inp: process.stdin.isTTY }
  beforeEach(() => {
    ;(process.stdout as any).isTTY = true
    ;(process.stdin as any).isTTY = true
  })
  afterEach(() => {
    ;(process.stdout as any).isTTY = realIsTTY.out
    ;(process.stdin as any).isTTY = realIsTTY.inp
    jest.resetModules()
    jest.restoreAllMocks()
  })

  it('emits cd sentinel and exits(0)', async () => {
    jest.doMock('inquirer', () => ({
      __esModule: true,
      default: { prompt: jest.fn()
        .mockResolvedValueOnce({ projectPath: '/abs/proj' })
        .mockResolvedValueOnce({ action: 'cd' }) },
    }))
    const { default: List } = await import('../src/commands/list')
    const exitSpy = jest.spyOn(List.prototype as any, 'exit').mockImplementation(() => { throw new Error('exit') })
    const logSpy = jest.spyOn(List.prototype as any, 'log').mockImplementation(() => {})
    try { await new (List as any)().run() } catch {}
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^__PROJECTOR_CD__ \/abs\/proj$/))
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('spawns editor for open-default', async () => {
    jest.doMock('inquirer', () => ({
      __esModule: true,
      default: { prompt: jest.fn()
        .mockResolvedValueOnce({ projectPath: '/abs/proj' })
        .mockResolvedValueOnce({ action: 'open-default' }) },
    }))
    jest.doMock('../src/lib/commands/open-utils', () => ({
      __esModule: true,
      buildEditorCommand: () => ({ cmd: 'code', args: ['/abs/proj'] }),
      defaultEditorFromEnv: () => 'code',
      supportedEditors: () => ['code'],
      isGuiEditor: () => true,
    }))
    const spawnSpy = jest.spyOn(child_process, 'spawn').mockReturnValue({ on: () => {} } as any)
    const { default: List } = await import('../src/commands/list')
    const list = new (List as any)()
    await list.run()
    expect(spawnSpy).toHaveBeenCalledWith('code', ['/abs/proj'], expect.any(Object))
  })
})
```

```ts
// test/shell-command.test.ts (sketch)
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import ShellCmd from '../src/commands/shell'

describe('shell command', () => {
  let tmpDir: string, rc: string
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'proj-rc-'))
    rc = path.join(tmpDir, 'rc')
    await fs.writeFile(rc, '# rc\nexport FOO=bar\n', 'utf8')
  })

  it('dry-run install prints block', async () => {
    await ShellCmd.run(['--install', '--dry-run', '--rc', rc, '--shell', 'zsh'])
    // capture stdout with spy and assert block markers and content present
  })

  it('install is idempotent and creates backups', async () => {
    await ShellCmd.run(['--install', '--rc', rc, '--shell', 'zsh'])
    const first = await fs.readFile(rc, 'utf8')
    await ShellCmd.run(['--install', '--rc', rc, '--shell', 'zsh'])
    const second = await fs.readFile(rc, 'utf8')
    expect((second.match(/# >>> projector wrapper >>>/g) || []).length).toBe(1)
    const backups = (await fs.readdir(tmpDir)).filter((f) => f.startsWith('rc.bak-'))
    expect(backups.length).toBeGreaterThanOrEqual(2)
  })

  it('remove dry-run shows matched block and remove deletes it', async () => {
    await ShellCmd.run(['--install', '--rc', rc, '--shell', 'zsh'])
    await ShellCmd.run(['--remove', '--dry-run', '--rc', rc])
    await ShellCmd.run(['--remove', '--rc', rc])
    const after = await fs.readFile(rc, 'utf8')
    expect(after).not.toContain('# >>> projector wrapper >>>')
  })
})
```
