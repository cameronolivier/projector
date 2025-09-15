status: done

# 0013 Interactive Actions from Table (Open, CD) with Shell Wrapper — Completion

## Summary
All gaps for 0013 are closed. The interactive action flow (select project → choose action) works across shells, the cd sentinel is consistent between CLI and wrappers, tests cover the critical branches, and docs are updated for bash/zsh, fish, and PowerShell.

## Resolved Items
- Config sentinel alignment: Wrappers and CLI both use `config.cdSentinel`; `list` emits the same sentinel and `shell/init` pass it into wrapper generation.
- Tests added: Interactive gating (`--interactive`/`--no-interactive`, TTY vs non‑TTY), cd emission exact string, open flows mapping to `buildEditorCommand`, and shell command dry‑run/install/remove with idempotency and backups.
- Docs completed: Architecture section for interactive flow; README sections for fish and PowerShell; examples for `projector shell` (`--dry-run`, `--remove`, `--shell`) and ExecutionPolicy guidance.
- Regex hardened: Removal path escapes begin/end markers to robustly find and remove blocks.
- UX polish: cd path prints then exits(0) explicitly; precedence with legacy `--select` documented; whitespace handling around sentinel verified.
- Windows profile note: Added ExecutionPolicy note for first-time setup.

## Acceptance
- Configured `cdSentinel` used consistently by CLI and wrappers.
- Tests cover interactive branches, cd emission, editor spawning, and shell installer flows.
- Docs updated with interactive flow and shell setup across bash/zsh, fish, and PowerShell.
- Install/remove idempotent with backups; regexes robust.

## Work Breakdown
- Core alignment (sentinel + regex): 1–2 hours
- Tests (3 files, mocks): 3–5 hours
- Docs updates (README + architecture): 1–2 hours
- Review, polish, and verify on macOS + Windows: 1–2 hours

## Risks & Mitigations
- Flaky TTY detection in tests: wrap TTY checks behind a small utility or temporarily override `process.stdout.isTTY` within tests; restore after.
- Shell nuances (fish, PowerShell quoting): covered by using simple string operations; include unit tests over generated wrapper strings.
- User‑customized profiles: installers create backups and replace only within marked block to avoid clobbering custom content.

## Acceptance Criteria (Final)
- Configured `cdSentinel` is used consistently by `list` and shell wrappers across all supported shells.
- Tests cover interactive branches, cd emission, editor spawning, and shell installer dry-run/install/remove.
- Docs updated with interactive flow, shell command usage, and fish/PowerShell instructions.
- Wrapper install/remove is idempotent and safe with backups; regexes are robust.
