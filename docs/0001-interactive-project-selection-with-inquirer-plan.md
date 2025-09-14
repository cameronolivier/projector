status: no started

# 0001 Interactive Project Selection with Inquirer — Plan

## Objective
Add an interactive selection experience to choose a project from the scanned results. The selection should be fast (supports large lists), searchable, and return a clear machine‑readable result for use in shells or scripts. This task does not change directories (covered by task 0002).

## Scope
- Add a `--select` flag to the `list` command to trigger an Inquirer prompt after the scan/table render.
- Provide output options: plain path (default), or JSON when `--format json`.
- Include optional `--path-only` to suppress table and print just the selected path.
- Keep UX accessible in TTY; fallback to non-interactive when not a TTY.

## UX Flow
1. User runs `projector --select [--directory ... --depth ... --verbose]`.
2. CLI scans as usual and displays table (unless `--path-only`).
3. Prompt shows searchable list: "Select a project".
4. After selection, CLI prints the absolute path (and optionally JSON) and exits 0.
5. If user cancels, exit 130 with message "Selection cancelled".

## Prompt Design
- Inquirer `autocomplete`-style list (fallback to standard list if autocomplete plugin is not used).
- Choice label: `${name} — ${status.type} (${type})  ${path}`
- Choice value: absolute path.
- Page size: 15–20; search by name, path, type.

## CLI Surface
- `projector --select` — interactive selection after scanning.
- `projector --select --path-only` — print only the selected path.
- `projector --select --format json` — print `{ name, path, type, status }` JSON.
- Non‑TTY behavior: ignore `--select`, warn, proceed non‑interactive.

## Technical Design
- Reuse existing scan pipeline in `src/commands/list.ts` (scanner, detector, analyzer, cache).
- Add flag definitions: `select: boolean`, `path-only: boolean`, `format: 'json' | 'text'`.
- After projects array is built and sorted, gate on `flags.select`:
  - Build choices from `projects` with enriched labels.
  - Call Inquirer prompt; on resolve, find the selected project by path.
  - Output based on `format`/`path-only`:
    - text (default): print absolute path on its own line; if not `path-only`, also keep table above.
    - json: `console.log(JSON.stringify({ name, path, type, status }, null, 2))`.
- Handle cancellation (SIGINT) and non‑TTY via `process.stdout.isTTY`/`process.stdin.isTTY`.
- Keep side effects isolated in command; no changes to lib modules.

## Dependencies
- `inquirer` already present (v12). Use builtin list; optionally add fuzzy filter within `source` function if adopting autocomplete later. For now, implement list with manual filter when `--verbose` is off to avoid excessive redraw.

## Telemetry/Exit Codes
- Success: exit 0; prints selected info.
- Cancelled: exit 130; prints one‑line notice to stderr.
- No projects: exit 0; message "No projects found".

## Testing Strategy
- Unit: Extract a pure function to map `AnalyzedProject[]` → `choices[]` and test formatting.
- Unit: Format function for text vs JSON output given a project.
- E2E (manual): Run `pnpm dev -- --select` against a sample folder; verify selection and output.
- Non‑TTY: simulate by forcing `process.stdout.isTTY = false` in test; ensure prompt is skipped.

## Acceptance Criteria
- `projector --select` prompts to choose a project after scanning.
- Selecting a project outputs its absolute path on stdout and exits 0.
- `--path-only` prints only the path (no table or extra lines after selection).
- `--format json` prints a valid JSON object with `name`, `path`, `type`, `status`.
- Non‑TTY: selection gracefully disabled with a warning; process continues without prompt.
- Cancellation exits with code 130 and a clear message.

## Out of Scope
- Changing directories or launching editors (task 0002/0003).
- Persisting last selection.
- Multi‑select.

## Implementation Steps
1. Add flags to `src/commands/list.ts`: `select`, `path-only`, `format`.
2. After building `projects`, if `flags.select && isTTY` then:
   - Build `choices` from `projects`.
   - `await inquirer.prompt({ type: 'list', name: 'p', choices, pageSize: 15 })`.
   - Find selected project by path; compute output; handle `--path-only` and `--format`.
3. Handle cancellation via try/catch and SIGINT listener; map to exit code 130.
4. Add unit tests for choice formatting and output serialization under `test/`.
5. Update `docs/architecture.md` CLI usage examples to show `--select`.

## Risks & Mitigations
- Large list performance: prefer simple list first; upgrade to autocomplete if needed.
- Terminal resizing/redraw: keep prompt after table render; avoid logging during prompt.
- Non‑TTY CI noise: warn once and skip prompt.
