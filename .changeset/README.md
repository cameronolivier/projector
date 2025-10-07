# Changesets

This repository uses [Changesets](https://github.com/changesets/changesets) to manage semantic versioning.

## Daily Workflow

1. After implementing a change, run `corepack pnpm changeset`.
2. Follow the prompt to pick the affected packages (always `projector`) and select the appropriate bump:
   - `patch` for bug fixes or internal refactors
   - `minor` for backwards-compatible feature work
   - `major` for breaking changes
3. Describe the change in the generated markdown file under `.changeset/`.
4. Commit the changeset alongside your code.

## Cutting a Release

When you're ready to publish:

```bash
corepack pnpm version-packages   # applies accumulated changesets, bumps package.json, updates CHANGELOG
git commit -am "chore(release): vX.Y.Z"
corepack pnpm release            # builds and publishes (or use for internal tagging)
```

Delete consumed `.changeset/*.md` only via `version-packages`; the CLI handles cleanup automatically.
