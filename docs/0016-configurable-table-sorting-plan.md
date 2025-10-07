status: pending

# 0016 Configurable Table Sorting — Plan

## Objective
Allow users to customize table sorting via CLI flags and configuration, supporting multiple sort keys (name, status, type, tag, last-edited) and sort directions (ascending/descending). This provides flexibility for different workflows and viewing preferences.

## Background
Feature 0015 establishes last-edited as the default sort order. However, different workflows benefit from different sorting:
- Alphabetical for finding specific projects by name
- By status to group planning/in-progress/complete projects
- By type to see all Node.js projects together
- By tag (parent directory) to group organizational categories

This feature adds CLI flags and config options to support these use cases.

## Scope
- Add CLI flags: `--sort-by <field>` and `--sort-dir <asc|desc>`
- Support sort fields: name, last-edited, status, type, tag
- Support sort directions: asc, desc
- Respect Feature 0015's config defaults when flags not provided
- Add multi-level sorting (primary + secondary keys)
- Maintain performance with fast comparison functions

## Out of Scope
- Interactive sort menu or TUI controls (future enhancement)
- Saving sort preference per project or globally (use config for now)
- Complex sort expressions or filters
- Column header click-to-sort (no TUI in this version)

## User Experience Goals
- Quick sorting via flags: `projector --sort-by name`
- Natural sort behavior: ascending for names, descending for dates
- Stable multi-level sorting with sensible secondary keys
- Config persists default preferences
- Helpful error messages for invalid sort keys

## Use Cases

### Use Case 1: Alphabetical Browsing
```bash
projector --sort-by name
# Shows projects A-Z for easy lookup
```

### Use Case 2: Status Grouping
```bash
projector --sort-by status
# Groups all "in progress" projects, then "planning", etc.
```

### Use Case 3: Type Organization
```bash
projector --sort-by type
# Shows all Node.js projects together, then Python, etc.
```

### Use Case 4: Category Grouping
```bash
projector --sort-by tag
# Groups by parent directory: all "tooling" projects, then "apps", etc.
```

### Use Case 5: Reverse Chronological
```bash
projector --sort-by last-edited --sort-dir desc
# Most recent first (Feature 0015 default)
```

### Use Case 6: Oldest First
```bash
projector --sort-by last-edited --sort-dir asc
# Shows oldest projects - good for finding stale projects
```

## Technical Design

### CLI Flags

Add to `src/commands/list.ts`:
```typescript
static override flags = {
  // ... existing flags
  'sort-by': Flags.string({
    description: 'Sort projects by field',
    options: ['name', 'last-edited', 'status', 'type', 'tag'],
    default: undefined, // uses config default when not provided
  }),
  'sort-dir': Flags.string({
    description: 'Sort direction',
    options: ['asc', 'desc'],
    default: undefined, // uses config default when not provided
  }),
}
```

### Configuration Schema

Already defined in Feature 0015, extend if needed:
```typescript
interface ProjectsConfig {
  // ... existing fields
  sorting?: {
    defaultOrder: 'last-edited' | 'name' | 'status' | 'type' | 'tag'
    direction: 'asc' | 'desc'
    // New: secondary sort key for tie-breaking
    secondaryOrder?: 'name' | 'last-edited' | 'status' | 'type' | 'tag'
  }
}
```

Default config:
```yaml
sorting:
  defaultOrder: last-edited
  direction: desc
  secondaryOrder: name  # tie-breaker
```

### Sort Implementation

Create `src/lib/output/sorter.ts`:
```typescript
export type SortField = 'name' | 'last-edited' | 'status' | 'type' | 'tag'
export type SortDirection = 'asc' | 'desc'

export interface SortOptions {
  field: SortField
  direction: SortDirection
  secondaryField?: SortField
}

export function sortProjects(
  projects: AnalyzedProject[],
  options: SortOptions
): AnalyzedProject[] {
  const { field, direction, secondaryField } = options
  const multiplier = direction === 'asc' ? 1 : -1

  return projects.sort((a, b) => {
    // Primary sort
    const primaryResult = compareByField(a, b, field) * multiplier
    if (primaryResult !== 0) {
      return primaryResult
    }

    // Secondary sort (always ascending for stability)
    if (secondaryField) {
      return compareByField(a, b, secondaryField)
    }

    return 0
  })
}

function compareByField(
  a: AnalyzedProject,
  b: AnalyzedProject,
  field: SortField
): number {
  switch (field) {
    case 'name':
      return a.name.localeCompare(b.name)

    case 'last-edited':
      return a.lastModified.getTime() - b.lastModified.getTime()

    case 'status':
      // Define status order: unknown < planning < active < feature-complete < stable < archived
      const statusOrder: Record<string, number> = {
        unknown: 0,
        planning: 1,
        phase: 2,      // treat phase as "active"
        active: 2,
        'feature-complete': 3,
        stable: 4,
        archived: 5,
      }
      const aOrder = statusOrder[a.status.type] ?? 0
      const bOrder = statusOrder[b.status.type] ?? 0
      return aOrder - bOrder

    case 'type':
      return a.type.localeCompare(b.type)

    case 'tag':
      const aTag = a.tag || ''
      const bTag = b.tag || ''
      return aTag.localeCompare(bTag)

    default:
      return 0
  }
}
```

### Integration in List Command

Update `src/commands/list.ts`:
```typescript
async run(): Promise<void> {
  const { flags } = await this.parse(List)
  const config = await configManager.loadConfig()

  // ... scanning and analysis ...

  // Determine sort options from flags > config > defaults
  const sortField: SortField = flags['sort-by'] as SortField
    || config.sorting?.defaultOrder
    || 'last-edited'

  const sortDir: SortDirection = flags['sort-dir'] as SortDirection
    || config.sorting?.direction
    || (sortField === 'last-edited' ? 'desc' : 'asc')

  const secondaryField: SortField | undefined =
    config.sorting?.secondaryOrder || 'name'

  // Sort projects
  const sorted = sortProjects(projects, {
    field: sortField,
    direction: sortDir,
    secondaryField,
  })

  // Generate and display table
  const table = tableGenerator.generateTable(sorted)
  this.log(table)
}
```

### Smart Defaults by Sort Field

Different fields have natural sort directions:
- **name**: ascending (A-Z)
- **last-edited**: descending (most recent first)
- **status**: ascending (unknown → planning → active → complete)
- **type**: ascending (alphabetical)
- **tag**: ascending (alphabetical)

Implement in flags default logic:
```typescript
const defaultDirection = (field: SortField): SortDirection => {
  return field === 'last-edited' ? 'desc' : 'asc'
}
```

## Implementation Steps

1. **Create Sorter Module** (`src/lib/output/sorter.ts`):
   - Define `SortField` and `SortDirection` types
   - Implement `sortProjects()` with multi-level sorting
   - Implement `compareByField()` for each sort key
   - Add status order mapping

2. **Add CLI Flags** (`src/commands/list.ts`):
   - Add `--sort-by` with field options
   - Add `--sort-dir` with direction options
   - Implement flag precedence: flags > config > defaults

3. **Update Configuration** (`src/lib/config/config.ts`):
   - Extend `sorting` config block (already added in 0015)
   - Add `secondaryOrder` option
   - Document defaults

4. **Integrate Sorting** (`src/commands/list.ts`):
   - Replace current sort with `sortProjects()` call
   - Apply flags and config to determine sort options
   - Use smart defaults for direction based on field

5. **Testing** (`test/sorting.test.ts`):
   - Test each sort field with sample projects
   - Test ascending and descending directions
   - Test multi-level sorting (primary + secondary)
   - Test flag precedence over config
   - Test invalid field/direction handling

6. **Documentation**:
   - Update README.md with sort examples
   - Update CLAUDE.md with sorting behavior
   - Add sort config to docs/config.md
   - Add examples to `projector list --help`

## Testing Strategy

### Unit Tests
```typescript
describe('Project Sorting', () => {
  const projects: AnalyzedProject[] = [
    { name: 'zebra', type: 'nodejs', status: { type: 'active' }, tag: 'apps', lastModified: new Date('2024-01-01') },
    { name: 'alpha', type: 'python', status: { type: 'planning' }, tag: 'tooling', lastModified: new Date('2024-10-07') },
    { name: 'beta', type: 'nodejs', status: { type: 'stable' }, tag: 'apps', lastModified: new Date('2024-06-15') },
  ]

  test('sorts by name ascending', () => {
    const sorted = sortProjects(projects, { field: 'name', direction: 'asc' })
    expect(sorted.map(p => p.name)).toEqual(['alpha', 'beta', 'zebra'])
  })

  test('sorts by last-edited descending', () => {
    const sorted = sortProjects(projects, { field: 'last-edited', direction: 'desc' })
    expect(sorted.map(p => p.name)).toEqual(['alpha', 'beta', 'zebra'])
  })

  test('sorts by status ascending', () => {
    const sorted = sortProjects(projects, { field: 'status', direction: 'asc' })
    expect(sorted.map(p => p.status.type)).toEqual(['planning', 'active', 'stable'])
  })

  test('sorts by type ascending', () => {
    const sorted = sortProjects(projects, { field: 'type', direction: 'asc' })
    expect(sorted.map(p => p.type)).toEqual(['nodejs', 'nodejs', 'python'])
  })

  test('sorts by tag ascending', () => {
    const sorted = sortProjects(projects, { field: 'tag', direction: 'asc' })
    expect(sorted.map(p => p.tag)).toEqual(['apps', 'apps', 'tooling'])
  })

  test('uses secondary sort for ties', () => {
    const sorted = sortProjects(projects, {
      field: 'type',
      direction: 'asc',
      secondaryField: 'name',
    })
    // Two nodejs projects should be alphabetical
    expect(sorted.slice(0, 2).map(p => p.name)).toEqual(['beta', 'zebra'])
  })
})
```

### Integration Tests
```bash
# Test CLI flags
projector --sort-by name
projector --sort-by status --sort-dir asc
projector --sort-by tag

# Test config defaults
# Set config: defaultOrder: 'name'
projector  # should show alphabetical

# Test flag override
# Config says 'name', but flag overrides:
projector --sort-by last-edited
```

### Visual Verification
- Run with each sort field and verify order makes sense
- Test descending vs ascending looks correct
- Verify secondary sort provides stable ordering

## Acceptance Criteria
- [ ] `--sort-by <field>` flag works for all supported fields
- [ ] `--sort-dir <asc|desc>` flag controls sort direction
- [ ] Flags override config defaults
- [ ] Smart direction defaults applied per field
- [ ] Multi-level sorting provides stable results
- [ ] Invalid sort fields show helpful error message
- [ ] Sorting maintains sub-second performance for 100+ projects
- [ ] Tests cover all sort fields and directions
- [ ] Documentation shows examples for each sort option

## Risks & Mitigations

**Risk**: Too many sort options confuse users
- *Mitigation*: Document common use cases with examples
- *Mitigation*: Keep sensible defaults (Feature 0015's last-edited)
- *Mitigation*: Use `--help` to show available options clearly

**Risk**: Sort performance degrades with many projects
- *Mitigation*: Sorting 1000 projects takes ~1-2ms, negligible
- *Mitigation*: Use simple comparison functions, avoid complex logic
- *Mitigation*: Profile with large datasets if needed

**Risk**: Users want to save sort preferences per-project
- *Mitigation*: Out of scope for now; use config for global preference
- *Mitigation*: Document in future enhancements
- *Mitigation*: Consider in future TUI/interactive feature

**Risk**: Status sort order is subjective
- *Mitigation*: Document the defined order in config docs
- *Mitigation*: Make order logical: unknown → planning → active → complete
- *Mitigation*: Consider making status order configurable in future

## Future Enhancements (Out of Scope)
- Interactive sort menu with arrow keys
- Multiple sort keys in single flag: `--sort-by type,name`
- Custom sort order configuration per field
- Reverse sort shorthand: `--sort-by -name` for descending
- Save last-used sort preference
- Column header indicators showing current sort

## Dependencies
- Feature 0014 (tags) for tag-based sorting
- Feature 0015 (last-edited) for default behavior
- Existing configuration system
- No new external dependencies

## Estimated Effort
- Implementation: 3-4 hours
- Testing: 2-3 hours
- Documentation: 1-2 hours
- Total: ~6-9 hours

## Success Metrics
- Users can easily sort by any supported field
- Sort behavior is intuitive and predictable
- Performance remains excellent even with sorting
- Positive feedback on flexibility
- No confusion about sort options or behavior
