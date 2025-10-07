# Configuration Guide

- Config file path: `~/.config/projector/config.yaml`
- Create/update via `projector init`, or edit the YAML manually.

## Example
```yaml
scanDirectory: "/Users/you/dev"
maxDepth: 10
ignorePatterns:
  - node_modules
  - .git
codeFileExtensions: [".ts", ".tsx", ".js", ".py"]

# Root detection and traversal
stopAtNodePackageRoot: true
rootMarkers: ["package.json", "pyproject.toml", "Cargo.toml", "go.mod", "composer.json", "pom.xml", "build.gradle", "settings.gradle", "CMakeLists.txt", "Makefile", "Gemfile"]
monorepoMarkers: ["pnpm-workspace.yaml", "lerna.json", "turbo.json", "nx.json", "go.work"]
lockfilesAsStrong: true
minCodeFilesToConsider: 5
stopAtVcsRoot: true
includeNestedPackages: "when-monorepo"   # one of: never | when-monorepo | always
respectGitIgnore: false                   # reserved; may affect performance
denylistPaths: ["examples", "fixtures", "samples", "docs/site"]
templatesDir: "/Users/you/.config/projector/templates"
templates:
  - id: "node-service"
    name: "Node Service"
    description: "Opinionated TypeScript service skeleton"
    source:
      type: builtin
      builtinId: node-service
    variables:
      - key: serviceName
        prompt: "Service name"
        required: true

tags:
  enabled: true
  style: badge          # badge | inline | suffix
  maxLength: 12
  colorPalette:
    - foreground: "#082032"
      background: "#61dafb"
    - foreground: "#1b1b1b"
      background: "#ffd54f"

# Display colors (trimmed for brevity)
colorScheme:
  header: "#00d4ff"
  phaseStatus: "#ff6b35"
  stableStatus: "#4caf50"
  unknownStatus: "#9e9e9e"
  projectName: "#ffffff"

# Git insights
gitInsights:
  enabled: true
  activityWindowDays: 30
  shortWindowDays: 7
  staleBranchThresholdDays: 90
  maxBranches: 5
  cacheTtlHours: 6
```

## Field Reference
- scanDirectory: Base directory to scan for projects.
- maxDepth: Maximum recursion depth during discovery.
- ignorePatterns: Directory/file names to skip during traversal.
- codeFileExtensions: Extensions used for weak “code presence” signals.

- stopAtNodePackageRoot: Stops when a `package.json` is found and registers that directory as a project.
- rootMarkers: Files that strongly indicate a project root (manifests/build files).
- monorepoMarkers: Files that indicate a workspace/monorepo root.
- lockfilesAsStrong: Treats lockfiles (e.g., `pnpm-lock.yaml`, `yarn.lock`) as strong signals (especially with a matching manifest).
- minCodeFilesToConsider: Threshold for weak code signal scoring.
- stopAtVcsRoot: Prevents crossing `.git` boundaries; accepts the directory as a root when scoring meets the threshold.
- includeNestedPackages: Whether to descend into monorepo package globs and include child packages.
- respectGitIgnore: Optionally skip git-ignored paths; off by default due to cost.
- denylistPaths: Substrings/globs to always skip (e.g., `examples`, `fixtures`).
- templatesDir: Directory where user-managed templates are stored (created automatically).
- templates: Template catalog combining built-ins and user entries. Each entry specifies `source.type` (`builtin` or `directory`), variables, optional tags, and post-generation commands.
- tags: Controls parent directory badge display. `enabled` toggles tags globally, `style` selects layout (`badge`, `inline`, `suffix`), `maxLength` truncates long folder names, and `colorPalette` provides foreground/background color pairs (hex).
- gitInsights: Controls git analysis. `enabled` toggles collection; `activityWindowDays`/`shortWindowDays` drive commit counts, `staleBranchThresholdDays` marks inactive branches, `maxBranches` limits branch summaries, and `cacheTtlHours` sets refresh cadence.

## Docs-First Projects
- A directory with a top-level `docs/` containing at least one `.md`/`.mdx` file is treated as a project root even if no code or git exists.
- Useful for planning-only phases; can be combined later with manifests and code to strengthen classification.

## Defaults
- stopAtVcsRoot: true
- includeNestedPackages: when-monorepo
- lockfilesAsStrong: true
- minCodeFilesToConsider: 5
- rootMarkers/monorepoMarkers include common ecosystem files by default.
- templatesDir defaults to `<config dir>/templates` with built-in templates (`node-service`, `docs-site`).
- tags default to enabled badge-style labels derived from parent directories with a curated 10-color palette and `maxLength` 12.
- gitInsights defaults to enabled, counts commits over 30/7-day windows, flags branches stale after 90 days, samples 5 branches, and refreshes every 6 hours.

## Tips
- Adjust `includeNestedPackages` to control monorepo depth.
- Use `denylistPaths` to silence noisy folders globally.
- Disable tag badges quickly with `tags.enabled: false` or switch to `inline` style if your terminal theme dislikes background colors.
- Keep `ignorePatterns` lean for performance; prefer stronger markers when possible.
