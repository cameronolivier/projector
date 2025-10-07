status: not started

# 0020 Last Edited Column — Plan

## Overview
Add a “Last Edited” column to the projector table that highlights how recently each project changed. The feature combines git history and filesystem signals to surface actionable freshness data while staying in lockstep with Phase 5 sorting enhancements.

## Problem Statement
- Contributors lack quick visibility into stale vs. active projects.
- Existing metadata (`lastModified` from directory stats) is noisy because tooling writes can bump mtimes.
- Sorting by activity (Feature 0015/0016) requires authoritative timestamps.
- Switching to git or Finder to confirm recency slows workflows and breaks flow.

## Goals
1. Provide accurate last-edited timestamps with git-first fidelity.
2. Keep the table readable by formatting dates relative to “now” with color cues.
3. Make the column configurable (visibility + format) without breaking existing layouts.
4. Feed the new metadata into cache + sorting so later work (0015/0016) can rely on it.

## Scope
- Discovery pipeline: enrich project metadata with `lastEdited`.
- Cache layer: persist timestamps and invalidate when underlying signals change.
- Output layer: render new column, formatting, and color rules.
- Configuration + docs: defaults, overrides, and user education.
- Non-goals: deep git analytics, CI awareness, or timezone localization beyond UTC.

## Proposed Solution

### Data Flow & Acquisition
1. **Git Timestamp (preferred)**
   - Command: `git log -1 --format=%ct -- <root>` executed via shared `GitClient`.
   - Use repository HEAD (respecting configured branch if available).
   - Handle repos without commits (empty history) gracefully.
2. **Filesystem Fallback**
   - Collect mtimes for strong markers (manifest, lockfile, `docs/`, primary config) via `fs.promises.stat`.
   - Take max mtime to approximate last edit.
3. **Normalization**
   - Convert timestamps to epoch milliseconds and ISO-8601 string in UTC.
   - Record provenance: `{ source: 'git' | 'filesystem' | 'unknown' }`.
   - Store relative label (e.g., “2d ago”) for render layer via formatter util.

### Domain Model Extensions
- Extend `ProjectMetadata` in `src/lib/types.ts` with:
  ```ts
  interface LastEditedInfo {
    epochMs: number
    isoUtc: string
    source: 'git' | 'filesystem' | 'unknown'
  }
  lastEdited?: LastEditedInfo
  ```
- Update `AnalyzedProject` and cache payload schemas to include `lastEdited`.
- Ensure backward compatibility by making the field optional in existing JSON.

### Configuration Surface
- Add defaults in `src/lib/config/defaults.ts`:
  ```yaml
  output:
    table:
      columns:
        lastEdited: true
      lastEdited:
        format: relative   # relative | datetime
        colors:
          hot: 7           # days
          warm: 30
  ```
- Support CLI flags:
  - `--no-last-edited` to hide column temporarily.
  - `--last-edited-format=<relative|datetime>` to override config.
- Document precedence: CLI flag → config → default.

### Rendering Strategy
- Place column between `Status` and `Progress` (or before Git until Feature 0019 lands).
- Format values using `formatRelative(epochMs)` with thresholds for color tokens:
  - `< hot` → green, `< warm` → yellow, `>= warm` → red, missing → dimmed “—”.
- Align column right; maintain consistent width by padding via helper.
- For datetime mode, use `YYYY-MM-DD HH:mm` (UTC) to avoid locale surprises.

### Caching & Invalidation
- Cache `lastEdited` under project cache entry (`src/lib/cache/manager.ts`).
- Invalidate when:
  - Git HEAD hash changes (already tracked in cache metadata) or repo lacks commits.
  - File mtime for strong markers changes (store `fingerprint.signature` array).
- When fallback data matches cached value, skip expensive git call (memoize per repo).

### CLI & Documentation
- Update `src/commands/list.ts` help text and table header definitions.
- Extend docs (`docs/TASKS.md`, `docs/architecture.md`, config reference) with guidance, examples, and flag references.
- Provide screenshot snippet showing color-coded column.

## Implementation Plan
1. **Types & Config**
   - Update `ProjectMetadata`, config defaults, schema validation, and config loader tests.
2. **Detector**
   - Introduce `LastEditedDetector` in `src/lib/tracking/last-edited-detector.ts`.
   - Reuse shared `GitClient` (add `getLatestCommitEpoch(projectPath)` helper).
   - Add fallback aggregator for filesystem markers.
3. **Pipeline Integration**
   - Call detector inside existing analyzer (likely `ProjectAnalyzer.enrichMetadata`).
   - Merge results into metadata; ensure cached values round-trip.
4. **Formatter & Renderer**
   - Add `formatLastEdited` util in `src/lib/output/formatters/last-edited.ts`.
   - Wire column builder inside `src/lib/output/table.ts`.
5. **CLI Flags & Docs**
   - Extend `list` command flags and update help text.
   - Document config options and CLI overrides.
6. **Testing & QA**
   - Author unit + integration tests (see below).
   - Add manual test checklist in docs/QA notes (optional).

## Testing Strategy
- **Unit**
  - Git detector returns correct epoch for repositories with commits.
  - Fallback aggregator picks max mtime across candidate files.
  - Formatter outputs correct strings for relative and datetime modes.
- **Cache**
  - Persist + reload `lastEdited` without precision loss.
  - Cache invalidation triggers when git HEAD changes.
- **Integration**
  - Table output includes colored column and respects `--no-last-edited`.
  - Sorting pipeline consumes new metadata without regressions (mocked integration with Feature 0015 tests).
- **Config**
  - Config toggles hide column and change format.
  - CLI flags override config.

## Migration & Compatibility
- Column enabled by default; existing scripts unaffected unless they parse table text (call out in CHANGELOG).
- Provide opt-out config: `output.table.columns.lastEdited: false`.
- Ensure JSON exports and other consumers receive the new metadata gracefully (optional `--json` update).

## Risks & Mitigations
- **Git cost / repo size**: batch git calls per repo and bail out early on bare repos; timebox command execution (e.g., 500ms).
- **Timezone confusion**: enforce UTC and relative strings; document clearly.
- **Cache divergence**: include git HEAD hash and marker mtimes in cache signature to stay fresh.
- **Non-git projects**: fallback ensures column still shows useful data; mark unknown with dim placeholder.

## Success Criteria
- Accurate timestamps (within 60s of actual git commit time) for repos with history.
- Column renders with consistent alignment, color, and format.
- Sorting features (0015/0016) consume metadata without additional work.
- Config + flags allow disabling or reformatting with no lingering state.
- No measurable regression (>5ms) in list command runtime on 500-project corpus.

## Estimated Effort
- Metadata + config plumbing: 3h
- Git detector + filesystem fallback implementation: 4h
- Cache integration and invalidation updates: 2h
- Formatter + table rendering + CLI flags: 3h
- Tests (unit, cache, integration) and manual QA: 3h
- Documentation updates: 1h

**Total: ~16h**

## Dependencies & Follow-up
- Builds on git detection utilities in `src/lib/tracking`.
- Coordinates with Feature 0015/0016 for sorting changes (ensure exposed metadata matches expectations).
- Follow-up ideas: expose `--last-edited-since <duration>` filter; integrate with activity badge once Feature 0019 lands.
