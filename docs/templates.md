# Template System

Projector ships with a lightweight template system for bootstrapping new projects from curated scaffolds. Templates can be applied interactively or scripted for automation.

## CLI Commands

| Command | Description |
| --- | --- |
| `projector template list` | Show available templates (built-in + user). Add `--json` for machine-readable output. |
| `projector template apply <id> <target>` | Apply a template into a target directory. Prompts for required variables if not provided. |
| `projector template init` | Fully interactive apply workflow (choose template, destination, and variables). |
| `projector template add --from <path> --id <id>` | Register a directory as a reusable template. Copies files into the templates directory and updates config. |

Useful flags:
- `--var key=value`: provide variable values from the command line (repeatable).
- `--vars path/to/vars.json`: load variables from a JSON file.
- `--force`: allow applying into a non-empty directory.
- `--dry-run`: simulate apply without writing files.
- `--skip-post`: skip post-generation commands declared by the template.

## Configuration

Templates live under the config directory by default:

```yaml
# ~/.config/projector/config.yaml
templatesDir: /Users/you/.config/projector/templates
templates:
  - id: node-service
    name: Node Service
    description: Opinionated TypeScript service skeleton
    tags: ["node", "service"]
    source:
      type: builtin
      builtinId: node-service
    variables:
      - key: serviceName
        prompt: Service name
        required: true
      - key: description
        prompt: Service description
        default: Internal service built with Projector
    postCommands:
      - pnpm install
  - id: docs-site
    name: Docs Site
    description: Markdown-first documentation starter
    source:
      type: builtin
      builtinId: docs-site
    variables:
      - key: projectName
        prompt: Project name
        required: true
```

- `templatesDir`: base directory for user-managed templates. `projector template add` writes into this directory.
- `templates`: catalog of templates. Entries can reference built-in assets (`type: builtin`) or directories inside `templatesDir` (`type: directory`, `path: <relative-path>`).

When adding a template from a directory, Projector snapshots the content into `templatesDir/<id>` and writes a `template.json` manifest alongside the files.

## Authoring Templates

- **Placeholders**: Use `{{variable}}`, `${variable}`, or `__VARIABLE__` in filenames and file contents. Values are substituted during apply.
- **Binary files**: Binary assets are copied byte-for-byte; substitution only runs on detected text files.
- **Variables**: Declare prompts in the template definition so CLI runs can solicit values. Required variables without defaults prompt interactively unless provided via flags.
- **Post Commands**: Optional shell commands run in the destination directory after files are written (e.g., `pnpm install`). Skip with `--skip-post`.
- **Metadata**: Applied templates write `.projector-template.json` recording the template id, timestamp, and variables used.

## Built-in Templates

Two starter templates ship with Projector and are copied into `dist/templates` during build:
- `node-service`: TypeScript service scaffold with sample scripts.
- `docs-site`: Markdown documentation starter with a basic MkDocs config.

Use the built-ins as references when creating custom templates.
