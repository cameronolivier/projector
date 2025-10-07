jest.mock('chalk', () => {
  const passthrough = ((value: string) => value) as any
  passthrough.bold = (value: string) => value
  const hex = () => {
    const fn = ((value: string) => value) as any
    fn.bold = (value: string) => value
    return fn
  }
  const bgHex = () => {
    const fn = ((value: string) => value) as any
    fn.hex = () => ((value: string) => value)
    return fn
  }

  return {
    __esModule: true,
    default: Object.assign(passthrough, {
      hex,
      bgHex,
      gray: (value: string) => value,
      dim: (value: string) => value,
      bold: (value: string) => value,
      green: (value: string) => value,
      cyan: (value: string) => value,
    }),
  }
})

import { TableGenerator } from '../src/lib/output/table'
import { ProjectType } from '../src/lib/types'
import type { AnalyzedProject, GitInsights, ProjectStatus } from '../src/lib/types'

describe('TableGenerator git output', () => {
  const status: ProjectStatus = {
    type: 'phase',
    details: 'Phase 1/3',
    confidence: 0.8,
  }

  const git: GitInsights = {
    currentBranch: 'main',
    head: { sha: 'abcdef1234567890', author: 'Cam', subject: 'feat: add', committedAt: Date.now() - 2 * 60 * 60 * 1000 },
    commitsInWindow: { windowDays: 30, count: 5 },
    commitsInShortWindow: { windowDays: 7, count: 2 },
    ahead: 1,
    behind: 0,
    branchSummaries: [
      { name: 'main', lastCommitSha: 'abcdef1234567890', lastCommitDate: Date.now() - 2 * 60 * 60 * 1000 },
      { name: 'legacy', lastCommitSha: '1111111111111111', lastCommitDate: Date.now() - 200 * 24 * 60 * 60 * 1000 },
    ],
    staleBranches: { total: 1, sample: ['legacy'], thresholdDays: 90 },
    collectedAt: Date.now(),
  }

  const project: AnalyzedProject = {
    name: 'demo',
    path: '/tmp/demo',
    type: ProjectType.NodeJS,
    languages: ['TypeScript'],
    hasGit: true,
    files: ['package.json'],
    lastModified: new Date(),
    status,
    description: 'Sample project',
    trackingFiles: [],
    confidence: status.confidence,
    git,
  }

  it('renders git summary column with branch and activity data', () => {
    const generator = new TableGenerator()
    const table = generator.generateTable([project])

    expect(table).toContain('demo')
    expect(table).toContain('main')
    expect(table).toContain('5/30d')
    expect(table).toContain('stale branch')
  })

  it('includes git counts in summary output', () => {
    const generator = new TableGenerator()
    const summary = generator.generateSummary([project])

    expect(summary).toContain('1 git-enabled')
    expect(summary).toContain('1 with stale branches')
  })

  it('produces verbose git details with project context', () => {
    const generator = new TableGenerator()
    const details = generator.generateGitDetails([project])

    expect(details).not.toBeNull()
    expect(details).toContain('Git insights')
    expect(details).toContain('demo')
    expect(details).toContain('legacy')
  })
})
