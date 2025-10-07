status: not started

# 0021 Interactive Project Actions Listing — Plan

## Overview
Ship a first-class interactive “project actions” experience that lets users perform contextual operations (ignore, open, future actions) without leaving the CLI. The feature expands Phase 5’s UX goals by layering a reusable action registry on top of the existing discovery pipeline.

## Problem Statement
- Current CLI is primarily read-only; adjusting ignore lists or triggering actions requires editing config files or rerunning commands with flags.
- Operators want to triage projects (ignore noisy repos, launch editors, etc.) in bulk while staying inside the tool.
- Future enhancements (badges, tags, progress) will generate more “actions” that need a consistent invocation surface.

## Goals
1. Provide a TUI-first workflow for selecting one or many projects and executing actions.
2. Deliver a pluggable action registry so additional actions can be added without reworking the UI.
3. Persist ignore toggles via config updates and cache invalidation while keeping operations safe and recoverable.
4. Support non-TTY environments with graceful fallbacks and clear guidance.

## Scope
- New `projector actions` command plus `projector list --actions` shortcut.
- Action registry abstraction, ignore manager, and configuration persistence.
- Interactive UI with keyboard shortcuts, multi-select, dry-run, and summary output.
- Telemetry/logging hooks, documentation updates, and test coverage.
- Non-goals: Full-screen TUI framework, fuzzy search (defer to later), or remote integrations.

## Experience & Flow
1. User launches actions mode (`projector actions` or `projector list --actions`).
2. Discovery pipeline loads projects (filters + cache respected); results passed to UI.
3. UI renders paginated selectable list with key metadata (name, status, last edited, badges if available).
4. Keyboard interactions:
   - `↑/↓` navigate, `space` toggle selection.
   - `i` quick-toggle ignore action.
   - `a` opens action palette (registry-driven).
   - `/` optional filter (simple substring search).
   - `Enter` executes selected actions, `Esc/q` exits without changes.
5. Confirmation step shows action summary; user can confirm or abort.
6. Post-execution summary prints changes (e.g., “Ignored 2 projects”) and CLI exits 0.

## Proposed Solution

### Command Entry Points
- `src/commands/actions.ts`: dedicated command orchestrating discovery, action registry, and UI.
- `src/commands/list.ts`: add `--actions` flag to delegate to actions command when invoked.
- Shared options: `--filter`, `--tag`, `--dry-run`, `--no-tui`.

### UI Architecture
- Prefer lightweight prompt system (e.g., `@clack/prompts`) with custom renderer for multi-select + action palette.
- Extract UI layer into `src/lib/actions/ui/actions-view.ts` with pure state machine + render adapter to keep logic testable.
- Provide `TerminalCapabilities` helper to detect width/height, colors, keypress support; fall back to sequential prompts if minimal TTY.

### Action Registry & Types
- Define contract in `src/lib/actions/types.ts`:
  ```ts
  interface ProjectAction {
    id: string
    label: string
    description?: string
    scope: 'single' | 'multi'
    shortcut?: string
    perform(context: ProjectActionContext): Promise<ProjectActionResult>
    isEnabled?(project: ProjectMetadata): boolean
  }
  ```
- `ProjectActionContext` includes selected projects, config manager, cache manager, logger, and dry-run flag.
- `ProjectActionResult` returns summary + optional follow-up (e.g., open command spawn).
- Registry (`ActionRegistry`) loads core actions and allows additional registrations (future plugin hook).

### Ignore Management & Persistence
- Create `IgnoreManager` in `src/lib/tracking/ignore-manager.ts` backed by configuration system.
- Manage `tracking.ignore.projects` list (absolute paths or canonical IDs).
- Support transactional updates:
  1. Clone current config.
  2. Apply toggles.
  3. Persist via `ConfigurationManager.save()` with backup/rollback on failure.
- Trigger cache invalidation by calling `cacheManager.invalidate(projectId)` for affected entries.

### State & Telemetry
- Maintain UI state in pure data structure:
  - `selectedProjectIds: Set<string>`
  - `pendingActions: ActionExecution[]`
  - `filterText: string`
  - `mode: 'list' | 'palette' | 'confirm'`
- Emit debug logs (`logger.debug`) for selected actions + counts (no PII).
- Provide `--dry-run` to execute without persistence (actions must honor flag).

### Configuration & Flags
- Add config defaults:
  ```yaml
  actions:
    enabled: true
    defaultView: list
    allowMultiSelect: true
    shortcuts:
      ignore: i
  ```
- CLI flags override config: `--no-tui`, `--single`, `--actions-default=<actionId>`.
- Document compatibility with Feature 0013 wrappers (cd sentinel unaffected).

## Implementation Plan
1. **Foundations**
   - Add types (`ProjectAction`, `ProjectActionContext`, etc.) and registry skeleton with unit tests.
   - Implement `IgnoreManager` with config read/write helpers and validation.
2. **UI Layer**
   - Build state machine and renderer adapters (TTY + fallback).
   - Support keyboard shortcuts, filter, pagination.
3. **Actions**
   - Implement `toggle-ignore` action (single + multi scope).
   - Stub placeholders for future actions (open, shell) with TODOs to keep API consistent.
4. **Command Wiring**
   - Create `actions` command; integrate discovery loader, registry, UI, config flags.
   - Update `list.ts` to forward when `--actions` flag used.
5. **Cache & Persistence**
   - Ensure ignore toggles hit cache invalidation.
   - Respect `--dry-run` by short-circuiting persistence.
6. **Docs & Help**
   - Update CLI help, `docs/architecture.md`, `docs/TASKS.md`, add usage examples + wrapper tips.
   - Provide short asciinema/GIF guidance for maintainers.

## Testing Strategy
- **Unit Tests**
  - Registry registration/order, `isEnabled` filtering, and shortcut metadata.
  - Ignore manager persistence (add/remove, duplicate suppression, dry-run no-op).
  - State machine transitions per keypress.
- **Integration Tests (mock TTY)**
  - Execute toggle-ignore flow end-to-end with `--dry-run` and without.
  - Multi-select toggles multiple projects, summary aggregates correctly.
  - `--no-tui` falls back to prompts/error with actionable message.
- **Snapshot/Output**
  - Summary output text matches expectation.
  - Config file diff after toggles.
- **Regression**
  - Running `projector list` without flags unaffected.
  - Works alongside Feature 0013 interactive actions (table prompt) without conflict.

## Migration & Compatibility
- New command; existing workflows unchanged unless user opts in.
- Document addition in CHANGELOG + docs; provide `actions.enabled: false` config to disable.
- Ensure config migration adds defaults lazily to avoid rewriting user files.

## Success Criteria
- Actions UI launches in <200ms after discovery for 500 projects.
- Ignore toggles persist correctly (config + cache) and reflect in subsequent list output.
- `--dry-run` completes without touching config or cache.
- Non-TTY invocation prints guidance and exits with code 1.
- Registry architecture allows adding new action with <10 LOC changes outside action module.

## Risks & Mitigations
- **TTY variance**: detect capabilities; fallback path ensures scriptability.
- **Concurrent config edits**: take file lock / write atomically via temp file and rename.
- **Large project sets**: implement virtualization (render window) and search to keep UI responsive.
- **Dependency footprint**: evaluate `ink` vs. `clack`; prefer minimal additions (<50kB gzip).

## Dependencies & Follow-up
- Builds on Feature 0013 interactive flow patterns and sentinel convention.
- Requires configuration manager and cache manager APIs (already in repo).
- Follow-ups: register open-in-editor action, integrate with badge metadata (Feature 0019), add tagging action after Feature 0014.

## Estimated Effort
- Registry + types: 3h
- Ignore manager + persistence: 3h
- UI state machine + renderer: 6-8h
- Command wiring + flags: 2h
- Tests: 4h
- Documentation + polish: 2h

**Total: ~20h**
