status: done

# 0003 IDE Integration (code, webstorm, etc.) — Plan

## Objective
Open a selected project directly in a user-specified IDE/editor (e.g., VS Code, WebStorm, IntelliJ, Cursor, Sublime, Vim) with a fast, scriptable CLI.

## Scope
- New command: `open` to launch an editor on the chosen project directory.
- Selection: `--select` (interactive) or `--name <substring>` (non-interactive) to choose project.
- Editor choice: `--editor <name>` with safe, whitelisted values and sensible defaults.
- Options: `--dry-run` (print command only), `--wait` (where supported), `--editor-args "--reuse-window"`.

## CLI Surface
- `projector open --select --editor code`
- `projector open --name api --editor webstorm`
- `projector open --select --editor code --wait`
- `projector open --name cli --editor cursor --dry-run`

## Technical Design
- File: `src/commands/open.ts`.
- Reuse discovery pipeline (ConfigurationManager → ProjectScanner → TypeDetector → TrackingAnalyzer → CacheManager), like `jump`.
- Implement helper module `src/lib/commands/open-utils.ts`:
  - `resolveEditorCommand(editor: EditorId, projectPath: string, opts) -> { cmd: string, args: string[] }`
  - `supportedEditors(): EditorId[]`
  - `isGuiEditor(editor): boolean` to determine default `--wait` behavior.
- Editor mapping (prefer CLI, fallback to macOS `open -a` when needed):
  - code: `code [--wait] <path>`; macOS fallback: `open -a "Visual Studio Code" <path>`
  - webstorm: `webstorm <path>`; fallback: `open -a "WebStorm" <path>`
  - idea/intellij: `idea <path>`; fallback: `open -a "IntelliJ IDEA" <path>`
  - cursor: `cursor <path>`; fallback: `open -a "Cursor" <path>`
  - sublime: `subl <path>`; fallback: `open -a "Sublime Text" <path>`
  - vim: `vim <path>`; nvim: `nvim <path>` (terminal editors; ignore `--wait`)
- Spawn: `child_process.spawn(cmd, args, { stdio: 'inherit', detached: true, shell: process.platform === 'win32' })`.
- Security: whitelist editor ids; pass path and args as separate argv entries; no shell interpolation.
- Non‑TTY with `--select`: warn and exit 2; allow `--name` for non‑interactive.
- Defaults: `--editor` default from env `PROJECTOR_DEFAULT_EDITOR` or `code`.

## UX/Behavior
- If editor CLI not found but macOS app exists, use `open -a` fallback.
- `--dry-run`: print the exact command that would run, then exit 0.
- Unknown editor id: print supported list and exit 2.
- If multiple matches for `--name`, warn and use first; suggest `--select`.

## Testing Strategy
- Unit-test `open-utils.ts` mapping for each editor: verifies command/args and `--wait`/`--editor-args` handling.
- Do not actually spawn editors in tests; rely on pure mapping tests.
- Basic selection filter tests reuse `filterByName` (already covered).

## Acceptance Criteria
- `projector open --select --editor code` launches VS Code on the selected project.
- `--name` works non-interactively; `--dry-run` prints command.
- Fallback to macOS `open -a` when CLI unavailable.
- Safe handling of paths and args; unknown editor errors with guidance.

## Implementation Steps
1. Create `src/lib/commands/open-utils.ts` with editor mappings and types.
2. Implement `src/commands/open.ts` using scan + selection flow like `jump`.
3. Add flags (`--editor`, `--wait`, `--editor-args`, `--dry-run`, plus scan flags).
4. Unit tests for utils under `test/`.
5. Update `docs/architecture.md` CLI usage with `open` examples.
6. Add short section in docs on enabling editor CLIs (e.g., VS Code "code" command).

## Risks & Mitigations
- Editor CLI not installed: document CLI install steps; use macOS fallback where possible.
- Windows support: use `shell: true` for PATH resolution; keep args quoted correctly.
