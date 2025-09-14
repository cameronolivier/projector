# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts`: CLI entry; defaults to `list` command.
- `src/commands/`: OCLIF commands (`list.ts`, `init.ts`, `cache.ts`).
- `src/lib/`: Core modules — `discovery/`, `tracking/`, `output/`, `config/`, `cache/`, `types.ts`.
- `dist/`: Transpiled output (TypeScript → Node.js).
- `docs/`: Architecture and performance notes.
- `test/`: Jest tests (add `*.test.ts`).

## Build, Test, and Development Commands
- `pnpm dev`: Run CLI in TS via `tsx` (no build).
- `pnpm build`: Type-check and emit to `dist/`.
- `pnpm test` / `pnpm test:watch`: Run Jest.
- `pnpm lint:check` / `pnpm lint:fix`: ESLint checks/fixes.
- `pnpm prettier:check` / `pnpm prettier:write`: Format check/fix.
- `pnpm link` / `pnpm unlink`: Link CLI globally as `projector`.

Examples:
- Local run: `pnpm dev -- --depth 3 --verbose`
- After build: `node dist/index.js` or `projector` (if linked)

## Coding Style & Naming Conventions
- Language: TypeScript (Node >= 20). Indent 2 spaces.
- Linting: ESLint with `@typescript-eslint`; formatting via Prettier.
- Files: use `kebab-case` for command files, `camelCase` for symbols, `PascalCase` for classes.
- Commands: place in `src/commands/` and export default OCLIF `Command`.
- Avoid side effects in libs; keep modules pure and testable.

## Testing Guidelines
- Framework: Jest (+ ts-jest). Place tests under `test/` as `name.test.ts`.
- Aim for coverage on detectors, analyzers, and table output.
- Run tests: `pnpm test`. Use `pnpm test:watch` during development.

## Commit & Pull Request Guidelines
- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc. (see git history).
- PRs: include concise description, linked issues, and CLI examples (flags/outputs). Add screenshots for table output when relevant.
- Keep changes scoped; update docs under `docs/` when behavior or flags change.

## Security & Configuration Tips
- Config path: `~/.config/projector/config.yaml` (created via `projector init`).
- Cache path: `~/.config/projector/cache/` — use `projector cache --clear` or `--prune` to manage.
- Do not commit personal config/cache. Respect `.gitignore` and avoid reading outside scan roots in new code.
