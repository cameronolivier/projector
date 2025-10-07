# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` boots the CLI, defaulting to the `list` command.
- Feature commands live in `src/commands/`; keep each command self-contained and export the default OCLIF `Command`.
- Shared logic sits in `src/lib/` (subfolders for discovery, tracking, output, config, cache) and should remain pure and testable.
- Transpiled output lands in `dist/`; do not edit files there.
- Tests reside under `test/` using `*.test.ts`; add fixtures alongside if needed.

## Build, Test, and Development Commands
- `pnpm dev -- --depth 3 --verbose` runs the CLI via `tsx` without building.
- `pnpm build` performs type-checking and emits JavaScript to `dist/`.
- `pnpm test` (or `pnpm test:watch`) executes Jest suites; ensure new modules ship with coverage.
- `pnpm lint:check` / `pnpm lint:fix` enforce ESLint, and `pnpm prettier:check` / `pnpm prettier:write` handle formatting.
- Use `pnpm link` / `pnpm unlink` to expose the CLI globally as `projector` for manual validation.

## Coding Style & Naming Conventions
- Use TypeScript targeting Node 20+ with 2-space indentation.
- Prefer pure functions in `src/lib/`; avoid side effects in shared utilities.
- Commands use kebab-case filenames; symbols favor camelCase, with classes in PascalCase.
- Let Prettier format code and ESLint (`@typescript-eslint`) guard stylistic consistency.

## Testing Guidelines
- Write Jest tests in `test/` mirroring the source path where possible, e.g., `test/tracking/collector.test.ts`.
- Cover detectors, analyzers, and table formatting edge cases; mock file system access rather than touching the real config directory.
- Run `pnpm test` before submitting; add targeted regression tests when fixing bugs.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat:`, `fix:`, `docs:`); keep scopes meaningful.
- PRs should describe behavior changes, list CLI samples (flags/outputs), link issues, and attach screenshots for table output when helpful.
- Scope changes narrowly; update `docs/` if behavior, flags, or config paths evolve.

## Release Process
- Capture every user-facing change with `corepack pnpm changeset`, pick the correct semver bump, and commit the generated `.changeset/*.md`.
- When ready to ship, run `corepack pnpm version-packages` to bump versions and update the changelog automatically.
- Tag the release (`git tag vX.Y.Z`) and optionally publish via `corepack pnpm release` once artifacts look good.
- Never delete `.changeset` entries manually; the CLI cleans them up during `version-packages`.

## Security & Configuration Tips
- Respect the config location `~/.config/projector/config.yaml` and cache under `~/.config/projector/cache/`; never commit user state.
- Avoid reading outside declared scan roots; input validation is required for new discovery logic.
