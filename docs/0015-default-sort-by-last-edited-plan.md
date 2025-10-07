status: pending

# 0015 Default Sort by Last Edited — Plan

## Objective
Change the default project table sorting from alphabetical (by name) to last-edited order, showing most recently modified projects first. This prioritizes active work and makes it easier to find projects you're currently working on.

## Background
Currently, projects are sorted alphabetically by name after scanning. This means recently edited projects can appear anywhere in the list. For developers working on multiple projects, sorting by last-edited time surfaces active projects at the top, reducing cognitive load and navigation time.

The `ProjectDirectory` interface already captures `lastModified: Date` from directory stats during scanning, so we have the data available. We just need to change the default sort behavior.

## Scope
- Change default project sorting to last-edited (most recent first)
- Use existing `lastModified` field from directory stats
- Maintain current alphabetical sorting as fallback for ties
- Add configuration option to preserve alphabetical default for users who prefer it
- Ensure sorting is fast and doesn't impact scan performance

## Out of Scope
- User-selectable sorting at runtime (covered in Feature 0016)
- Caching or pre-computing sort order (not needed - sorting is fast)
- Git-based last-edited detection (use filesystem mtime for simplicity)
- Deep file inspection for "true" last edit (too expensive)

## User Experience Goals
- Running `projector` shows recently edited projects at the top
- Projects worked on today appear before projects untouched for weeks
- Sorting feels natural and helps workflow
- Users who prefer alphabetical can configure it back
- No noticeable performance impact

## Technical Design

### Current Sorting Logic
In `src/commands/list.ts` (around line 268):
```typescript
// Sort projects by name
projects.sort((a, b) => a.name.localeCompare(b.name))
```

### New Sorting Logic
Replace with last-edited sort:
```typescript
// Sort projects by last modified (most recent first), then by name
projects.sort((a, b) => {
  // Primary sort: most recent first
  const timeDiff = b.lastModified.getTime() - a.lastModified.getTime()
  if (timeDiff !== 0) {
    return timeDiff
  }

  // Secondary sort: alphabetical for same timestamp
  return a.name.localeCompare(b.name)
})
```

### Configuration Support
Add to `ProjectsConfig`:
```typescript
interface ProjectsConfig {
  // ... existing fields
  sorting?: {
    defaultOrder: 'last-edited' | 'name' | 'status' | 'type'  // default: 'last-edited'
    direction: 'asc' | 'desc'  // default: 'desc' for last-edited, 'asc' for name
  }
}
```

### Last Modified Detection Strategy

The `lastModified` field is already populated from `fs.stat().mtime` on the project directory. This gives us:

**Pros**:
- Already collected during scan (zero additional cost)
- Fast and reliable
- Accurate for most use cases
- No need for git operations or deep file scanning

**Behavior**:
- Directory mtime updates when files are added/removed/modified
- Works for git and non-git projects
- Reflects actual filesystem activity
- OS-maintained, no manual computation needed

**Edge cases**:
- Git operations (checkout, merge) update directory mtime
- Build artifacts (if in project root) can update mtime
- Some operations (chmod) may not update mtime as expected

For this feature, directory mtime is sufficient and performant. Future enhancements (Feature 0016+) could add git-based last-commit-date as an alternative.

### Performance Considerations

**Sort Performance**:
- JavaScript Array.sort() on 50-100 projects: ~0.1ms
- Negligible compared to filesystem scanning
- No need for optimization or caching

**Memory**:
- No additional memory overhead
- Using existing `lastModified` field

**Impact on scan**:
- Zero impact - mtime already collected
- No additional filesystem operations

## Implementation Steps

1. **Update Default Sort** (`src/commands/list.ts`):
   - Change existing sort from `a.name.localeCompare(b.name)` to last-edited
   - Use `lastModified.getTime()` for numeric comparison
   - Keep name-based tie-breaking for readability

2. **Add Configuration** (`src/lib/config/config.ts`):
   - Add `sorting` config block with defaults
   - Default: `{ defaultOrder: 'last-edited', direction: 'desc' }`
   - Support fallback to 'name' for users who prefer alphabetical

3. **Apply Config in List Command** (`src/commands/list.ts`):
   - Read `config.sorting.defaultOrder` to determine sort field
   - Apply appropriate comparison function based on config
   - Respect `sorting.direction` for asc/desc

4. **Testing** (`test/sorting-last-edited.test.ts`):
   - Test last-edited sort puts recent projects first
   - Test alphabetical fallback for same timestamp
   - Test config option to switch back to name sort
   - Test with projects at various modification times

5. **Documentation**:
   - Update README.md to mention new default sort order
   - Update CLAUDE.md with sorting behavior
   - Add sorting config to docs/config.md
   - Consider adding note in first-run output

## Testing Strategy

### Unit Tests
```typescript
describe('Project Sorting - Last Edited', () => {
  test('sorts by most recent first', () => {
    const projects = [
      { name: 'old-project', lastModified: new Date('2024-01-01'), /* ... */ },
      { name: 'new-project', lastModified: new Date('2024-10-07'), /* ... */ },
      { name: 'mid-project', lastModified: new Date('2024-06-15'), /* ... */ },
    ]

    const sorted = sortProjects(projects, { defaultOrder: 'last-edited', direction: 'desc' })

    expect(sorted[0].name).toBe('new-project')
    expect(sorted[1].name).toBe('mid-project')
    expect(sorted[2].name).toBe('old-project')
  })

  test('uses alphabetical as tie-breaker', () => {
    const sameDate = new Date('2024-10-07')
    const projects = [
      { name: 'zebra', lastModified: sameDate, /* ... */ },
      { name: 'alpha', lastModified: sameDate, /* ... */ },
    ]

    const sorted = sortProjects(projects, { defaultOrder: 'last-edited', direction: 'desc' })

    expect(sorted[0].name).toBe('alpha')
    expect(sorted[1].name).toBe('zebra')
  })

  test('respects config to use name sort instead', () => {
    const projects = [
      { name: 'zebra', lastModified: new Date('2024-10-07'), /* ... */ },
      { name: 'alpha', lastModified: new Date('2024-01-01'), /* ... */ },
    ]

    const sorted = sortProjects(projects, { defaultOrder: 'name', direction: 'asc' })

    expect(sorted[0].name).toBe('alpha')
    expect(sorted[1].name).toBe('zebra')
  })
})
```

### Integration Tests
- Run `projector` and verify recently edited projects appear first
- Modify a project's files and verify it moves to top on next run
- Test with config `defaultOrder: 'name'` and verify alphabetical sort

### Visual Verification
- Touch a project directory: `touch ~/dev/tooling/projector`
- Run `projector` and confirm it appears at top
- Compare with projects modified weeks ago

## Acceptance Criteria
- [ ] Default project table shows most recently edited projects first
- [ ] Projects with same modification time are alphabetically sorted
- [ ] Config option `sorting.defaultOrder: 'name'` reverts to alphabetical
- [ ] Sorting adds no measurable performance overhead (<1ms for 100 projects)
- [ ] Tests verify sorting behavior with various timestamps
- [ ] Documentation updated to reflect new default behavior
- [ ] No regressions in table formatting or display

## Risks & Mitigations

**Risk**: Users expect alphabetical and are confused by new order
- *Mitigation*: Add configuration option to revert to alphabetical
- *Mitigation*: Document new behavior in README and potentially show hint on first run
- *Mitigation*: Make it easy to discover sort config

**Risk**: Directory mtime doesn't accurately reflect "work"
- *Mitigation*: Document behavior and limitations
- *Mitigation*: Future Feature 0016 can add alternative sort keys (git commits, etc.)
- *Mitigation*: For most use cases, mtime is accurate enough

**Risk**: Breaking change for users with automation
- *Mitigation*: Non-breaking - just changes default order, no API changes
- *Mitigation*: Config allows reverting to old behavior
- *Mitigation*: Consider semver minor version bump

## Migration Notes
- Existing users will see new sort order on next update
- No data migration needed - using existing field
- Users who prefer old behavior can set `sorting.defaultOrder: 'name'` in config
- No breaking changes to CLI arguments or output format

## Future Enhancements (Out of Scope)
- Runtime sort selection via flags (Feature 0016)
- Git-based last-commit-date sorting
- Sorting by status, type, or other fields
- Multi-level sort with UI controls
- Persistent sort preference per user

## Dependencies
- Existing `lastModified` field in `ProjectDirectory`
- Current configuration system
- No new external dependencies

## Estimated Effort
- Implementation: 2-3 hours
- Testing: 1-2 hours
- Documentation: 1 hour
- Total: ~4-6 hours

## Success Metrics
- Most recently edited projects always appear at top
- Zero performance regression
- Positive user feedback on prioritization
- Easy to revert to old behavior if desired
- Sorting is stable and predictable
