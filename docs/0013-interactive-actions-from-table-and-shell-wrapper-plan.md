status: done

# 0013 Interactive Actions from Table (Open, CD) with Shell Wrapper — Plan

## Objective
Enable a seamless TTY-first workflow where running `projector` (list) lets the user pick a project and immediately choose an action: open in editor or change directory. Provide a small shell wrapper to allow cd-in-place despite OS constraints.

## Scope
- Add an interactive action flow to `list` when run in a TTY.
- Actions: Open in default editor; Open in specific editor; Change directory; Print path.
- Emit a sentinel string for cd so a shell wrapper can change directory in the caller shell.
- Add flags and config to enable/disable interaction and set defaults.
- Update docs with shell wrapper snippets for bash/zsh/fish.

## UX Flow
1. User runs `projector` in a TTY (no flags).
2. CLI scans and renders the table as today.
3. Prompt 1: “Select a project”.
4. Prompt 2: “Choose action” → [Open in default editor, Open in..., Change directory, Print path].
5. Behavior per action:
   - Open in default editor: launch editor immediately.
   - Open in...: prompt for editor (from supported list), then launch.
   - Change directory: print `__PROJECTOR_CD__ <abs-path>` to stdout and exit 0.
   - Print path: print absolute path only.
6. Non‑TTY: no prompts; current non‑interactive behavior unchanged.

## CLI/Config Surface
- Flags (list.ts):
  - `--interactive` (boolean): force interactive action flow (default: auto in TTY).
  - `--no-interactive`: disable prompts even in TTY.
  - Keep existing `--select`, `--path-only` for backward compatibility (they remain supported).
- Config (`~/.config/projector/config.yaml`):
  - `defaultInteractive: true` (enable interactive action flow by default in TTY).
  - `defaultEditor`: driven by env `PROJECTOR_DEFAULT_EDITOR` or config key.
  - `cdSentinel`: `__PROJECTOR_CD__` (string; advanced users may change).

## Technical Design
- File changes:
  - `src/commands/list.ts`:
    - Detect interactive mode: `interactive = flags.interactive ?? (isTTY && config.defaultInteractive)`.
    - After rendering table, if `interactive` is true:
      - Prompt for project (reuse existing prompt logic; filter/sort already done).
      - Prompt for action (Inquirer list):
        - “Open in <defaultEditor>” → call existing `open` command logic or reuse `open-utils` to spawn.
        - “Open in…” → prompt for an editor from `supportedEditors()`, then spawn.
        - “Change directory” → `console.log(`${config.cdSentinel} ${absPath}`)` and exit.
        - “Print path” → `console.log(absPath)`.
    - Ensure non‑TTY paths skip prompts.
  - `src/lib/commands/open-utils.ts`: already provides safe mapping and spawning inputs. Reuse `buildEditorCommand` + `spawn` logic for launching.
  - New small helper (optional): `src/lib/commands/interactive-actions.ts` for building choices and labels, to keep `list.ts` tidy.
- Shell wrapper:
  - We will document a function that intercepts sentinel lines:
    - If output starts with `__PROJECTOR_CD__ `, `cd` to the path; otherwise print output.
- Safety:
  - Keep editor execution path safe (no shell interpolation; pass argv array to `spawn`).
  - Do not attempt to `cd` from the CLI itself; rely on wrapper.

## Implementation Steps
1. Add config keys to `ProjectsConfig` and `ConfigurationManager` for `defaultInteractive`, `defaultEditor` (optional; keep env override), and `cdSentinel`.
2. Update `src/commands/list.ts`:
   - Add `--interactive` and `--no-interactive` flags.
   - After table render, if interactive, show project selection prompt.
   - Show action prompt and handle the four actions.
   - For Open actions, reuse `open-utils` to construct command and spawn.
   - For cd, print sentinel + absolute path and exit 0.
3. Add helper module (optional) for prompt choice builders.
4. Write unit tests:
   - Config defaults merged correctly.
   - Helper that formats sentinel output returns `__PROJECTOR_CD__ <path>`.
   - Mock Inquirer to verify the flow branches (at least for action → cd vs open mapping).
   - Ensure non‑TTY bypasses interactive flow.
5. Docs:
   - Update README and docs/architecture.md with interactive flow and examples.
   - Add shell wrapper snippets:
     - bash/zsh:
       - function projector() { local out; out="$(command projector "$@")" || return; [[ "$out" == __PROJECTOR_CD__* ]] && cd "${out#__PROJECTOR_CD__ }" || printf '%s\n' "$out"; }
     - fish:
       - function projector; set out (command projector $argv); and if string match -q "__PROJECTOR_CD__*" -- $out; cd (string replace "__PROJECTOR_CD__ " "" -- $out); else; printf '%s\n' $out; end; end

## Testing Strategy
- Unit tests with mocks for Inquirer and `child_process.spawn` to avoid launching real editors.
- Verify that when action = cd, stdout contains the exact sentinel + path.
- Verify that when action = open, we call `buildEditorCommand` with the correct editor and args.
- Non‑TTY: ensure no prompts are shown (branch is skipped).

## Acceptance Criteria
- Running `projector` in a TTY shows table, then prompts to select a project and an action by default (unless disabled).
- Choosing “Open in default editor” launches the editor for the selected project.
- Choosing “Change directory” prints `__PROJECTOR_CD__ <abs-path>` and exits 0.
- Documented shell wrapper updates the current shell when the sentinel is printed.
- Non‑TTY behavior remains unchanged and script‑friendly.

## Risks & Mitigations
- Behavior change surprise: make it configurable and easy to disable with `--no-interactive` or config.
- TTY edge cases (pipes, CI): default off when not a TTY; keep `--interactive` to force when needed.
- Cross‑platform editor launching: continue using `open-utils` mapping and macOS `open -a` fallbacks.

## Out of Scope (for this task)
- Fuzzy search or fzf integration.
- New actions beyond the four listed.
- Persistent keybindings or TUI interface.
