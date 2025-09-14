status: no started

# 0002 Jump to Directory Functionality — Plan

## Objective
Enable users to immediately change into a selected project’s directory from the terminal, with a simple, fast workflow that plays well with common shells.

## Scope
- Add a new OCLIF command `jump` that resolves a single project path and prints it (path-only by default).
- Support interactive selection (`--select`) and non-interactive filters (`--name <substring>`).
- Provide optional `--print-cd` to emit a shell-ready `cd "..."` command for easy `eval` usage.
- Include shell function snippets in docs for a first-class “cd into selection” experience.

## UX Flow
1. `projector jump --select` → scan, prompt, print absolute path; user runs `cd $(projector jump --select)`.
2. `projector jump --name api` → prints first matching project path (case-insensitive substring).
3. `eval "$(projector jump --select --print-cd)"` → directly changes directory in the current shell via `cd` output.

## CLI Surface
- `projector jump` — prints path of best match (error if none). 
- Flags:
  - `--select` use interactive selection (TTY only)
  - `--name <pattern>` case-insensitive substring match on project name
  - `--print-cd` print `cd "<path>"` instead of the raw path
  - Reuse `--directory`, `--depth`, `--verbose`, cache flags from `list`

## Technical Design
- New file: `src/commands/jump.ts`.
- Reuse discovery/analyzer pipeline (ConfigurationManager → ProjectScanner → TypeDetector → TrackingAnalyzer → CacheManager).
- Sort results by name; apply `--name` filter before selection; if 0/ >1 matches without `--select`, handle accordingly.
- Output:
  - default: `console.log(absPath)`
  - `--print-cd`: `console.log(\`cd "${absPath}"\`)`
- TTY detection for `--select`; on non-TTY, error with guidance.
- Exit codes: 0 success; 2 no match; 130 cancelled.

## Shell Integration (Docs Snippets)
- bash/zsh:
  ```sh
  pcd() { eval "$(projector jump --select --print-cd)"; }
  ```
- fish:
  ```fish
  function pcd; projector jump --select --print-cd | source; end
  ```

## Testing Strategy
- Unit: matcher `filterByName(projects, pattern)`; ensure case-insensitive substring.
- Unit: formatting for `--print-cd` and plain path.
- E2E (manual): verify integration with `eval` flow and non-TTY behavior.

## Acceptance Criteria
- `projector jump --select` prints a valid absolute path to stdout.
- `--print-cd` prints a single `cd` line suitable for `eval`/`source`.
- `--name` selects the first case-insensitive match without prompting.
- Non-TTY with `--select` fails gracefully with a clear message.
- Returns exit code 2 when no match is found.

## Out of Scope
- Launching IDEs or terminals (covered by task 0003).
- Persisting favorites or recents.
- Fuzzy matching beyond substring.

## Implementation Steps
1. Create `src/commands/jump.ts` with flags and help text.
2. Implement scan + filter logic; wire interactive selection via `inquirer` when `--select`.
3. Implement output modes (path vs `cd`).
4. Add small unit tests for filters/formatting in `test/`.
5. Update `docs/architecture.md` with `jump` examples and shell snippets.

## Risks & Mitigations
- Subshell cannot change parent directory: addressed by `--print-cd` + `eval` pattern and documented shell functions.
- Ambiguous matches with `--name`: print a short list and suggest `--select`.
