# Projector

Smart CLI for discovering and managing development projects with scoring-based root detection, monorepo awareness, and docs-first project support.

- CLI entry: `src/index.ts` (default command: `list`)
- Build: `pnpm build` (outputs to `dist/`)
- Dev: `pnpm dev -- --depth 3 --verbose`

## Configuration
- Config file: `~/.config/projector/config.yaml`
- See full options and defaults in `docs/config.md`.

Quick start:
```sh
pnpm install
pnpm dev -- --directory ~/dev --depth 3
```

## Usage
- Print merged configuration (YAML):
```sh
projector config --print
```

- Show config file path:
```sh
projector config --path
```

- List projects (default command):
```sh
projector              # same as: projector list
projector list --depth 5 --verbose
projector list --select --path-only   # interactively pick and print path
```

- Jump to a project (print path or a cd command):
```sh
projector jump --select
projector jump --name api
projector jump --select --print-cd     # emits: cd "<path>"
```

- Open a project in your editor:
```sh
projector open --select --editor code --wait
projector open --name web --editor webstorm
projector open --select --dry-run       # prints the command only
```

## Docs
- Architecture: `docs/architecture.md`
- Testing: `docs/TESTING.md`
- Configuration: `docs/config.md`
