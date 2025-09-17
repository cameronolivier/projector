status: done

# 0004 Project Template System — Plan

## Objective
Enable developers to scaffold new projects quickly from curated templates managed by projector. Provide a configuration-driven template catalog, interactive CLI to browse/apply templates, and automation for variable substitution plus post-generation hooks.

## Background
Projector currently focuses on discovering and inspecting existing projects. Teams repeatedly recreate boilerplate for new services and packages by copy/pasting from reference repositories. A first-class template system lets projector bootstrap standardized layouts (Node service, CLI, docs-first repo, etc.), aligning new projects with organizational conventions.

## Scope
- Template definition model, storage, and configuration wiring.
- CLI UX for listing templates and generating a project from a template.
- Local template materialization (copy files, apply variables, run post-hooks).
- Ability to register ad-hoc templates from an existing directory.
- Docs covering authoring templates and integrating with config.

## Out of Scope
- Remote template registries or downloads over HTTP/git (support local/built-in only for now).
- Opinionated language runtimes beyond copy + substitution (no dependency install).
- Complex templating logic (simple token/variable replacement only).
- Automatic git init or repo creation (documented as manual follow-up).

## User Experience Goals
- `projector template list` shows available templates (name, description, tags).
- `projector template apply <template> <target>` scaffolds into the target directory (auto-creates directory if missing, refuses to overwrite existing content unless `--force`).
- `projector template init` (interactive) prompts for template, destination, and required variables.
- `projector template add --from <path> --name <id>` snapshots a directory into the template catalog.
- Optional `--vars file.json` or repeated `--var key=value` for non-interactive runs.

## Template Definition Model
Represent templates in config to support both built-in shipped templates and user-defined entries.

```ts
interface TemplateDefinition {
  id: string          // unique key used on CLI
  name: string        // human label
  description?: string
  tags?: string[]
  source: {
    type: 'builtin' | 'directory'
    path?: string     // required for directory templates (absolute or relative to config)
    builtinId?: string // pointer to assets bundled with projector
  }
  variables?: Array<{
    key: string
    prompt: string
    default?: string
    required?: boolean
  }>
  postCommands?: string[] // shell commands executed in destination after copy
  initGit?: boolean       // optional convenience flag if we later wire git init
}
```

## Storage Layout
- Built-in templates live under `templates/` in the published package (`src/templates/**/*` → bundled into `dist/templates`).
- User templates stored under `~/.config/projector/templates/<template-id>/` managed by TemplateManager.
- `ConfigurationManager` extended with `templatesDir` (string) and `templates` (TemplateDefinition[]) defaults.
- Maintain manifest metadata file (e.g., `template.json`) alongside stored template content to ensure fidelity when exporting/importing.

## Template Rendering Pipeline
1. Resolve template definition by id (merge built-in + user-defined catalog).
2. Resolve source directory: builtin -> `new URL('../templates/<id>', import.meta.url)`, directory -> config-relative path.
3. Collect variables: load defaults from definition, merge CLI-provided overrides, prompt (via Inquirer) for missing required values.
4. Copy files recursively into target directory while performing token replacement on:
   - Filenames (e.g., `__name__` → variable value).
   - File contents for text files (use simple `${VAR}` placeholders; detect binary using `istextorbinary`).
5. Write metadata file `.projector-template.json` into destination summarizing template + chosen variables.
6. Execute `postCommands` using `execa`, streaming output. Respect `--skip-post` flag.
7. On failure, rollback by deleting partially generated directory when safe (if created during run and currently empty).

## CLI Additions
- New oclif command `template.ts` with subcommands:
  - `list`: lists catalog entries (supports `--json`).
  - `apply <template> [target]` with flags `--force`, `--var`, `--vars`, `--skip-post`.
  - `init`: interactive alias of `apply` (prompts for template, target, vars).
  - `add`: registers a new directory template; copies the directory tree into `templatesDir/<id>` and updates config manifest.
- Provide help/examples mirroring UX goals and integrate with `pnpm dev` command-run pipeline.

## Library Components
- `TemplateManager` (`src/lib/templates/manager.ts`): resolves catalog, merges definitions, handles add/export operations.
- `TemplateRenderer` (`src/lib/templates/renderer.ts`): copy + substitution logic, variable resolution, binary detection, post-command execution, rollback.
- `TemplatePrompts` (`src/lib/templates/prompts.ts`): Inquirer wrappers shared by CLI and tests.
- Extend `ConfigurationManager` to read/write `templates` array and `templatesDir` default (`~/.config/projector/templates`).
- Update `ProjectsConfig` (`src/lib/types.ts`) to include new fields with docstrings.

## Configuration Changes
Add defaults in `ConfigurationManager.getDefaultConfig()`:
- `templatesDir`: `path.join(xdgConfigHome, 'projector', 'templates')`
- `templates`: pre-populated with 1–2 built-in definitions (e.g., `node-service`, `docs-site`).
Ensure `mergeWithDefaults` merges template arrays (preserve built-in when user overrides). Document new schema in `docs/config.md`.

## Error Handling & Validation
- Validate unique template IDs when loading catalog (throw descriptive error listing duplicates).
- During `apply`, ensure target path either does not exist or is empty unless `--force`.
- Provide skip list for directories while copying (e.g., `.git`, `node_modules` when exporting as template) and allow override via config.
- Capture and surface post-command exit codes with colorized CLI feedback.

## Testing Strategy
- Unit tests for TemplateManager catalog merging, duplicate detection, add/register flows (use `memfs` or temporary directories via `fs/promises` + `tmp`).
- Renderer tests covering:
  - Variable substitution in filenames and contents.
  - Binary file passthrough (ensure no substitution occurs for `.png`, `.ico`).
  - Rollback on failure and `--force` behavior.
  - Post-command execution (mock `execa`).
- CLI command tests using oclif test harness for `template list` (JSON output) and `template apply` dry-run (use `--dry-run` flag in tests to avoid disk writes—implement as part of renderer for testability).
- Update integration fixtures if necessary to confirm new command appears in help output.

## Documentation Deliverables
- New section in `README.md` and `docs/config.md` describing template commands and configuration.
- Tutorial in `docs/ TEMPLATE.md` (e.g., `docs/templates.md`) showing how to author custom templates.
- Update `docs/TASKS.md` once implementation finishes.

## Risks & Mitigations
- **Template copy performance on large directories**: perform streaming copy and avoid reading entire files into memory; consider using `fs.cp` (Node 20) with filters plus manual substitution for targeted files.
- **Variable collisions**: enforce consistent placeholder syntax (`{{VAR}}`) and document quoting rules.
- **Post-command fallout**: run commands sequentially, stop on first failure, and prompt user to inspect logs.
- **Cross-platform path handling**: rely on `path` utilities, normalize separators during substitution.

## Implementation Steps
1. Define template-related types in `src/lib/types.ts`; update defaults and merge logic in `ConfigurationManager`.
2. Scaffold `TemplateManager` with catalog loading (built-in + user), ensure directories exist, and support `add` operations.
3. Build `TemplateRenderer` with substitution engine, binary detection, and post-command runner (wrapping `execa`).
4. Implement new oclif command `template.ts` with subcommands delegating to manager/renderer; wire interactive prompts.
5. Package built-in templates under `src/templates/` and ensure they ship in the build pipeline.
6. Write comprehensive Jest tests for manager, renderer, and CLI flows (mock filesystem/processes as needed).
7. Update documentation (README, docs/config.md, new template how-to) and refresh `docs/TASKS.md` status when shipped.
8. Perform manual validation: run `pnpm dev -- template list`, scaffold sample project, verify post-hooks.

## Acceptance Criteria
- `projector template list` enumerates built-in and user templates with accurate metadata.
- `projector template apply foo ~/dev/foo` creates directory, applies variables, and runs post-commands.
- Template registration via `projector template add --from ./scaffold --name foo` stores template and updates config manifest.
- All tests pass; documentation clearly explains authoring and using templates.
