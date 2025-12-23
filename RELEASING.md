# Release Process

## Quick Release (Recommended)

```bash
pnpm release:full
```

This single command does everything:
1. Runs semantic-release (analyzes commits, bumps version, updates files, creates commit & tag)
2. Builds the project with the new version
3. Pushes commit and tags to GitHub

## Step-by-Step (If you need more control)

```bash
# 1. Preview what will happen (optional)
pnpm release:dry

# 2. Create the release
pnpm release
# This updates: package.json, CHANGELOG.md, src/index.ts
# Creates: git commit + git tag

# 3. Build with the new version
pnpm build

# 4. Push to GitHub
git push --follow-tags
```

## How Versions are Calculated

Based on your conventional commits since the last release:

```bash
fix: bug fix              # Patch: 0.1.0 → 0.1.1
feat: new feature         # Minor: 0.1.0 → 0.2.0
feat!: breaking change    # Major: 0.1.0 → 1.0.0

# Or with footer:
feat: new feature

BREAKING CHANGE: describe the breaking change
```

## Files Updated by semantic-release

- `package.json` - version bumped
- `CHANGELOG.md` - release notes added
- `src/index.ts` - VERSION constant updated
- Git commit created with message: `chore(release): X.Y.Z`
- Git tag created: `vX.Y.Z`

## After Release

If you have the package linked globally:

```bash
# The new version is already built and ready
projector --version  # Shows new version
```

## Notes

- `dist/` is gitignored (not committed)
- Build happens locally after version bump
- No GitHub token needed (no GitHub releases created)
- No npm publish (npmPublish: false)
