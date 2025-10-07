status: pending

# 0014 Parent Directory Tags with Color Schemes — Plan

## Objective
Add visual category tags to projects based on their parent directory names, with each unique tag having a distinct color scheme. This provides visual grouping and quick identification of project categories (e.g., "tooling", "apps", "experiments") in the table output.

## Background
Projects are often organized into logical categories by parent directory structure (e.g., `~/dev/tooling/projector`, `~/dev/apps/web-dashboard`, `~/dev/experiments/ml-prototype`). Currently, the table shows flat project names without visual indication of their organizational context. Adding styled parent directory tags will help users quickly identify project categories and mentally group related projects.

## Scope
- Extract parent directory name as a "tag" for each project
- Assign stable, visually distinct colors to each unique tag
- Display tags in the table output with appropriate styling
- Support configuration for tag display preferences
- Handle edge cases (root-level projects, deep nesting)

## Out of Scope
- Custom user-defined tags independent of directory structure
- Tag-based filtering or search (future enhancement)
- Multi-level tag hierarchies (only immediate parent for now)
- Tag editing or manual override (derive from filesystem only)

## User Experience Goals
- Running `projector` shows each project with a colored tag badge
- Tags are visually distinct and consistent across runs
- Tags are compact and don't clutter the table
- Users can optionally disable tag display via config or flag

## Visual Design

### Tag Display Formats
```
Option 1 - Inline before name:
[tooling] projector        │ nodejs  │ active

Option 2 - Badge style with background:
 tooling  projector         │ nodejs  │ active

Option 3 - After name with separator:
projector (tooling)         │ nodejs  │ active
```

Recommendation: **Option 2** - Badge style with background color provides best visual separation and modern aesthetic.

### Color Assignment Strategy
Use a fixed palette of visually distinct colors with good contrast:
- Hash the tag name to an index in the color palette
- Ensure consistent color assignment across runs
- Support both light and dark terminal backgrounds

Color palette (using chalk):
```typescript
const TAG_COLORS = [
  'bgBlue',      // Blue background
  'bgGreen',     // Green background
  'bgYellow',    // Yellow background
  'bgMagenta',   // Magenta background
  'bgCyan',      // Cyan background
  'bgRedBright', // Bright red background
  'bgGreenBright', // Bright green background
  'bgBlueBright',  // Bright blue background
  'bgMagentaBright', // Bright magenta background
  'bgCyanBright',    // Bright cyan background
]
```

## Technical Design

### Data Model Changes

Extend `AnalyzedProject` interface:
```typescript
interface AnalyzedProject extends ProjectDirectory {
  status: ProjectStatus
  description: string
  trackingFiles: TrackingFile[]
  confidence: number
  git?: GitInsights
  tag?: string  // NEW: parent directory name
}
```

Add config options to `ProjectsConfig`:
```typescript
interface ProjectsConfig {
  // ... existing fields
  tags?: {
    enabled: boolean           // default: true
    style: 'badge' | 'inline' | 'suffix'  // default: 'badge'
    maxLength: number          // truncate long tags, default: 12
    colorPalette?: string[]    // override default colors
  }
}
```

### Tag Extraction Logic

In `src/lib/discovery/scanner.ts`:
```typescript
function extractTag(projectPath: string, scanDirectory: string): string | undefined {
  // Get relative path from scan directory
  const relativePath = path.relative(scanDirectory, projectPath)
  const parts = relativePath.split(path.sep)

  // If project is in root of scan directory, no tag
  if (parts.length <= 1) {
    return undefined
  }

  // Use immediate parent directory as tag
  return parts[parts.length - 2]
}
```

### Color Assignment Algorithm

In `src/lib/output/table.ts`:
```typescript
function getTagColor(tag: string, palette: string[]): ChalkFunction {
  // Hash tag name to consistent index
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % palette.length
  return chalk[palette[index]]
}

function formatTag(tag: string, config: TagConfig): string {
  const truncated = tag.length > config.maxLength
    ? tag.substring(0, config.maxLength - 1) + '…'
    : tag

  const color = getTagColor(tag, config.colorPalette || DEFAULT_PALETTE)

  switch (config.style) {
    case 'badge':
      return color(` ${truncated} `)
    case 'inline':
      return color(`[${truncated}]`)
    case 'suffix':
      return chalk.dim(`(${truncated})`)
    default:
      return color(` ${truncated} `)
  }
}
```

### Table Output Integration

Update `TableGenerator.generateTable()` to include tags in project name column:
```typescript
generateTable(projects: AnalyzedProject[]): string {
  const rows = projects.map(project => {
    const tagDisplay = project.tag && this.config.tags?.enabled !== false
      ? formatTag(project.tag, this.config.tags || DEFAULT_TAG_CONFIG) + ' '
      : ''

    const nameColumn = tagDisplay + this.formatProjectName(project.name)

    return [
      nameColumn,
      this.formatType(project.type),
      this.formatStatus(project.status),
      // ... other columns
    ]
  })

  // ... rest of table generation
}
```

## Implementation Steps

1. **Update Types** (`src/lib/types.ts`):
   - Add `tag?: string` to `AnalyzedProject` interface
   - Add `tags` config block to `ProjectsConfig` interface

2. **Tag Extraction** (`src/lib/discovery/scanner.ts`):
   - Implement `extractTag()` helper function
   - Update `scanDirectory()` to populate tag field on each discovered project
   - Handle edge cases (root-level projects, symlinks)

3. **Color Assignment** (`src/lib/output/table.ts`):
   - Implement stable hashing function for tag-to-color mapping
   - Add default color palette constant
   - Implement `formatTag()` with style variants

4. **Table Integration** (`src/lib/output/table.ts`):
   - Update `generateTable()` to render tags before project names
   - Adjust column width calculations to accommodate tags
   - Ensure proper spacing and alignment

5. **Configuration** (`src/lib/config/config.ts`):
   - Add default tag configuration to config schema
   - Support `tags.enabled`, `tags.style`, `tags.maxLength` options
   - Document in config.md

6. **Testing** (`test/table-tags.test.ts`):
   - Test tag extraction from various path structures
   - Test color consistency (same tag → same color)
   - Test tag truncation and formatting
   - Test config options (enabled/disabled, different styles)
   - Test edge cases (no tag, very long tags)

7. **Documentation**:
   - Update README.md with tag examples
   - Update CLAUDE.md with tag feature description
   - Add tag configuration to docs/config.md

## Testing Strategy

### Unit Tests
```typescript
describe('Tag Extraction', () => {
  test('extracts parent directory as tag', () => {
    const tag = extractTag('/Users/cam/dev/tooling/projector', '/Users/cam/dev')
    expect(tag).toBe('tooling')
  })

  test('returns undefined for root-level projects', () => {
    const tag = extractTag('/Users/cam/dev/my-project', '/Users/cam/dev')
    expect(tag).toBeUndefined()
  })

  test('handles deeply nested paths', () => {
    const tag = extractTag('/Users/cam/dev/apps/web/frontend', '/Users/cam/dev')
    expect(tag).toBe('web')  // immediate parent
  })
})

describe('Tag Color Assignment', () => {
  test('assigns consistent color for same tag', () => {
    const color1 = getTagColor('tooling', DEFAULT_PALETTE)
    const color2 = getTagColor('tooling', DEFAULT_PALETTE)
    expect(color1).toBe(color2)
  })

  test('assigns different colors for different tags', () => {
    const color1 = getTagColor('tooling', DEFAULT_PALETTE)
    const color2 = getTagColor('apps', DEFAULT_PALETTE)
    expect(color1).not.toBe(color2)
  })
})
```

### Visual Testing
- Manual verification of tag colors in terminal
- Test with light and dark terminal themes
- Verify tag spacing and alignment in table

## Acceptance Criteria
- [ ] Each project displays a tag derived from its parent directory
- [ ] Tags have visually distinct, stable colors
- [ ] Same tag across different projects shows same color
- [ ] Tag display can be toggled via config (`tags.enabled: false`)
- [ ] Tags are properly truncated if exceeding `maxLength`
- [ ] Root-level projects (no parent category) display without tags
- [ ] Table alignment remains clean with tags present
- [ ] Configuration options work as documented
- [ ] Tests cover extraction, coloring, and formatting logic

## Risks & Mitigations

**Risk**: Tag colors may not be visible on all terminal backgrounds
- *Mitigation*: Use background colors (bgBlue, bgGreen) instead of foreground colors for better visibility
- *Mitigation*: Document requirement for 256-color terminal support

**Risk**: Very long tag names could break table layout
- *Mitigation*: Implement `maxLength` truncation with ellipsis
- *Mitigation*: Make maxLength configurable

**Risk**: Users may not want tags cluttering their output
- *Mitigation*: Make tags optional via `tags.enabled: false` in config
- *Mitigation*: Consider adding `--no-tags` flag for quick disable

**Risk**: Hash collisions could assign same color to many tags
- *Mitigation*: Use 10+ color palette to reduce collision probability
- *Mitigation*: Document that color uniqueness is best-effort, not guaranteed

## Future Enhancements (Out of Scope)
- Tag-based filtering: `projector --tag tooling`
- Custom tag definitions independent of directory structure
- Multi-level tag hierarchies: `tooling/cli` for nested categories
- Tag statistics in summary output
- Tag color customization per tag name in config

## Dependencies
- Existing chalk integration for colored output
- Current table generation system
- Path utilities for directory extraction

## Estimated Effort
- Implementation: 4-6 hours
- Testing: 2-3 hours
- Documentation: 1-2 hours
- Total: ~8-11 hours

## Success Metrics
- Visual differentiation makes project categories immediately recognizable
- No performance degradation (tag extraction is O(1) per project)
- Positive user feedback on visual organization
- No regressions in existing table output or alignment
