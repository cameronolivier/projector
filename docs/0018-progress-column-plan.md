status: pending

# 0018 Progress Column — Plan

## Objective
Add a dedicated "Progress" column to the table showing completion metrics (completed/total) for projects with quantifiable progress. Display this only for projects in "in-progress" or "feature-complete" status, leaving the column blank for other statuses.

## Background
The current implementation already tracks phase information (`current/total`) from tracking files like CLAUDE.md, epics.md, and project_plan.md. This data shows project completion (e.g., "Phase 3/5", "15/20 tasks complete") but is currently embedded in the Status column details text.

A dedicated Progress column will:
- Make progress metrics more visible and scannable
- Allow easy identification of near-complete projects
- Provide visual progress bars or percentages
- Help prioritize work on projects close to completion

## Scope
- Add "Progress" column to table output
- Extract progress data from existing `PhaseInfo` in tracking files
- Display progress only for `in-progress` and `feature-complete` statuses
- Support multiple progress formats: fraction, percentage, bar
- Configuration for progress display preferences
- Handle edge cases (no progress data, indeterminate progress)

## Out of Scope
- Manual progress override or editing
- Progress tracking for status types beyond in-progress/feature-complete
- Historical progress tracking or trends
- Estimated completion dates
- Progress from git metrics (future enhancement)

## User Experience Goals
- Quick visual scan shows which projects are near completion
- Progress format is clear and unambiguous (15/20 is more clear than 75%)
- Empty progress cell for projects where it doesn't apply
- Configurable display format (fraction vs percentage vs bar)
- Progress updates automatically when tracking files change

## Visual Design

### Progress Display Formats

**Option 1 - Fraction (Recommended)**:
```
Progress
--------
15/20
3/5
12/15
—
```

**Option 2 - Percentage**:
```
Progress
--------
75%
60%
80%
—
```

**Option 3 - Progress Bar**:
```
Progress
--------
███████▓▓▓ 75%
███▓▓▓▓▓▓▓ 60%
████████▓▓ 80%
—
```

**Option 4 - Combined (Fraction + Bar)**:
```
Progress
--------
15/20 ███████▓
3/5   ███▓▓▓▓▓
12/15 ████████
—
```

Recommendation: **Option 1 (Fraction)** for clarity, with **Option 4 (Combined)** as configurable enhancement.

### Column Visibility by Status

| Status Type | Show Progress? | Example |
|-------------|----------------|---------|
| unknown | No | `—` |
| planning | No | `—` |
| **in-progress** | **Yes** | `3/5` |
| **feature-complete** | **Yes** | `5/5` |
| stable | No | `—` |
| archived | No | `—` |

## Technical Design

### Data Model

Progress data already exists in `PhaseInfo`:
```typescript
interface PhaseInfo {
  current: number    // completed items
  total: number      // total items
  name?: string      // optional phase name
}

interface TrackingInfo {
  phases?: PhaseInfo
  version?: string
  todos?: number
  description?: string
}
```

We'll use this existing structure - no new data model needed!

### Progress Extraction Strategy

Progress can come from multiple sources in tracking files:

1. **Phase markers**: `Phase 3/5` → `3/5`
2. **Task checkboxes**:
   ```markdown
   - [x] Task 1
   - [x] Task 2
   - [ ] Task 3
   ```
   → `2/3`

3. **Epic headers**:
   ```markdown
   ## Epic 1 - Complete
   ## Epic 2 - In Progress
   ## Epic 3 - Not Started
   ```
   → `1/3` epics complete

The `TrackingAnalyzer` already extracts these into `PhaseInfo`. We just need to:
1. Surface this data in `AnalyzedProject`
2. Format it in the table column

### Type Updates

Extend `AnalyzedProject` to include progress (already available via trackingFiles):
```typescript
// No changes needed - progress already in trackingFiles[].content.phases
// Just need to extract it in table generator
```

### Configuration

Add progress display options to `ProjectsConfig`:
```typescript
interface ProjectsConfig {
  // ... existing fields
  progress?: {
    enabled: boolean              // default: true
    format: 'fraction' | 'percentage' | 'bar' | 'combined'  // default: 'fraction'
    showForStatus: string[]       // default: ['in-progress', 'feature-complete']
    barLength: number             // default: 10 (chars for bar)
    emptyIndicator: string        // default: '—'
  }
}
```

Default config:
```yaml
progress:
  enabled: true
  format: fraction
  showForStatus:
    - in-progress
    - feature-complete
  barLength: 10
  emptyIndicator: —
```

### Table Generator Updates

Update `src/lib/output/table.ts`:

```typescript
generateTable(projects: AnalyzedProject[], colorScheme?: ColorScheme): string {
  const table = new Table({
    head: [
      chalk.bold('📁 Project'),
      chalk.bold('Status'),
      chalk.bold('Progress'),  // NEW COLUMN
      chalk.bold('Git'),
      chalk.bold('Type'),
      chalk.bold('📍 Location'),
      chalk.bold('Description')
    ],
    colWidths: [20, 15, 12, 28, 12, 32, 40],  // Adjusted widths
    // ...
  })

  for (const project of sortedProjects) {
    const row = this.formatRow(project, colorScheme)
    table.push(row)
  }

  return table.toString()
}

formatRow(project: AnalyzedProject, colorScheme?: ColorScheme): string[] {
  const projectName = this.formatProjectName(project.name)
  const status = this.formatStatus(project.status.details, project.status.type)
  const progress = this.formatProgress(project)  // NEW
  const git = this.formatGit(project.git)
  const type = this.formatProjectType(project.type)
  const location = this.formatLocation(project.path)
  const description = this.formatDescription(project.description)

  return [projectName, status, progress, git, type, location, description]
}

private formatProgress(project: AnalyzedProject): string {
  const config = this.config?.progress || DEFAULT_PROGRESS_CONFIG

  if (!config.enabled) {
    return ''
  }

  // Only show for specific statuses
  if (!config.showForStatus.includes(project.status.type)) {
    return chalk.dim(config.emptyIndicator)
  }

  // Extract progress from tracking files
  const progress = this.extractProgress(project)
  if (!progress) {
    return chalk.dim(config.emptyIndicator)
  }

  const { current, total } = progress

  switch (config.format) {
    case 'fraction':
      return this.formatFraction(current, total)

    case 'percentage':
      return this.formatPercentage(current, total)

    case 'bar':
      return this.formatBar(current, total, config.barLength)

    case 'combined':
      return this.formatCombined(current, total, config.barLength)

    default:
      return this.formatFraction(current, total)
  }
}

private extractProgress(project: AnalyzedProject): { current: number; total: number } | null {
  // Find first tracking file with phase info
  for (const file of project.trackingFiles) {
    if (file.content.phases && file.content.phases.total > 0) {
      return {
        current: file.content.phases.current,
        total: file.content.phases.total,
      }
    }
  }
  return null
}

private formatFraction(current: number, total: number): string {
  const percent = (current / total) * 100

  // Color code based on completion
  if (percent >= 90) {
    return chalk.green(`${current}/${total}`)
  } else if (percent >= 50) {
    return chalk.yellow(`${current}/${total}`)
  } else {
    return chalk.cyan(`${current}/${total}`)
  }
}

private formatPercentage(current: number, total: number): string {
  const percent = Math.round((current / total) * 100)

  if (percent >= 90) {
    return chalk.green(`${percent}%`)
  } else if (percent >= 50) {
    return chalk.yellow(`${percent}%`)
  } else {
    return chalk.cyan(`${percent}%`)
  }
}

private formatBar(current: number, total: number, barLength: number): string {
  const percent = current / total
  const filled = Math.round(percent * barLength)
  const empty = barLength - filled

  const bar = '█'.repeat(filled) + '▓'.repeat(empty)

  if (percent >= 0.9) {
    return chalk.green(bar)
  } else if (percent >= 0.5) {
    return chalk.yellow(bar)
  } else {
    return chalk.cyan(bar)
  }
}

private formatCombined(current: number, total: number, barLength: number): string {
  const fraction = this.formatFraction(current, total)
  const bar = this.formatBar(current, total, barLength)
  return `${fraction} ${bar}`
}
```

## Implementation Steps

1. **Update Configuration** (`src/lib/config/config.ts`):
   - Add `progress` config block to `ProjectsConfig`
   - Define default progress settings
   - Document in config schema

2. **Update Table Generator** (`src/lib/output/table.ts`):
   - Add "Progress" column to table headers
   - Adjust column widths (reduce Description to make room)
   - Implement `formatProgress()` method
   - Implement format helpers (fraction, percentage, bar, combined)
   - Implement `extractProgress()` to get data from tracking files

3. **Color Coding**:
   - Green: 90%+ complete (nearly done)
   - Yellow: 50-89% complete (good progress)
   - Cyan: <50% complete (early stages)
   - Dim: no data (—)

4. **Testing** (`test/progress-column.test.ts`):
   - Test progress extraction from various tracking files
   - Test each display format (fraction, percentage, bar, combined)
   - Test color coding at different completion levels
   - Test with projects missing progress data
   - Test with different status types
   - Test configuration options

5. **Documentation**:
   - Update README.md with Progress column examples
   - Document progress config in docs/config.md
   - Update CLAUDE.md with progress feature
   - Add screenshots showing progress formats

## Testing Strategy

### Unit Tests

```typescript
describe('Progress Column', () => {
  test('extracts progress from phase tracking', () => {
    const project = createMockProject({
      trackingFiles: [{
        content: {
          phases: { current: 3, total: 5 }
        }
      }]
    })

    const progress = extractProgress(project)
    expect(progress).toEqual({ current: 3, total: 5 })
  })

  test('shows progress for in-progress status', () => {
    const project = createMockProject({
      status: { type: 'in-progress' },
      trackingFiles: [{
        content: { phases: { current: 2, total: 4 } }
      }]
    })

    const formatted = formatProgress(project)
    expect(formatted).toContain('2/4')
  })

  test('shows empty indicator for planning status', () => {
    const project = createMockProject({
      status: { type: 'planning' },
      trackingFiles: [{
        content: { phases: { current: 1, total: 5 } }
      }]
    })

    const formatted = formatProgress(project)
    expect(formatted).toBe('—')
  })

  test('formats as percentage', () => {
    const formatted = formatPercentage(3, 4)
    expect(formatted).toContain('75%')
  })

  test('formats as bar', () => {
    const formatted = formatBar(7, 10, 10)
    expect(formatted).toMatch(/█{7}▓{3}/)
  })

  test('colors based on completion', () => {
    // 90%+ = green
    const high = formatFraction(9, 10)
    expect(high).toContain(chalk.green('9/10'))

    // 50-89% = yellow
    const mid = formatFraction(6, 10)
    expect(mid).toContain(chalk.yellow('6/10'))

    // <50% = cyan
    const low = formatFraction(2, 10)
    expect(low).toContain(chalk.cyan('2/10'))
  })
})
```

### Integration Tests
- Run on real projects with tracking files
- Verify progress displays correctly in table
- Test with different config formats
- Verify column alignment

### Visual Tests
- Check progress colors in terminal
- Verify bar characters render correctly
- Test with various terminal widths

## Acceptance Criteria
- [ ] Progress column appears in table between Status and Git columns
- [ ] Progress shows for in-progress and feature-complete projects
- [ ] Progress hidden (shows —) for other status types
- [ ] Fraction format shows "X/Y" with color coding
- [ ] Percentage format shows "N%" when configured
- [ ] Bar format shows visual progress bar when configured
- [ ] Combined format shows both fraction and bar
- [ ] Colors: green (90%+), yellow (50-89%), cyan (<50%)
- [ ] Configuration options work as documented
- [ ] No progress data shows empty indicator (—)
- [ ] Table alignment remains clean with new column
- [ ] Tests cover all formats and edge cases

## Risks & Mitigations

**Risk**: Progress column clutters narrow terminals
- *Mitigation*: Make column narrow (10-12 chars max)
- *Mitigation*: Allow disabling via `progress.enabled: false`
- *Mitigation*: Responsive column widths if possible

**Risk**: Not all projects have progress data
- *Mitigation*: Show empty indicator (—) for no data
- *Mitigation*: Only show for relevant statuses (in-progress, feature-complete)
- *Mitigation*: Document expected tracking file formats

**Risk**: Multiple tracking files with conflicting progress
- *Mitigation*: Use first file with valid progress data
- *Mitigation*: Priority order: project_plan.md > CLAUDE.md > epics.md
- *Mitigation*: Document which file takes precedence

**Risk**: Bar characters don't render on all terminals
- *Mitigation*: Default to fraction format (safest)
- *Mitigation*: Test on common terminals (iTerm, Terminal, VSCode)
- *Mitigation*: Provide fallback characters

## Future Enhancements (Out of Scope)
- Progress from git metrics (% of files changed vs planned)
- Estimated completion dates based on velocity
- Progress trends (speeding up vs slowing down)
- Sub-task progress drill-down
- Progress alerts (stuck projects, near-complete)

## Dependencies
- Feature 0017 (status types: in-progress, feature-complete)
- Existing phase tracking in `TrackingAnalyzer`
- Current table generation system
- Configuration system

## Estimated Effort
- Configuration update: 1 hour
- Table generator updates: 3-4 hours
- Format implementations: 2-3 hours
- Testing: 2-3 hours
- Documentation: 1-2 hours
- Total: ~9-13 hours

## Success Metrics
- Progress visible at a glance in table
- Easy to identify near-complete projects
- No performance impact
- Positive user feedback on clarity
- Configuration provides flexibility without complexity
