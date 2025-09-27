import { GitAnalyzer } from '../src/lib/git/analyzer'
import type { CachedGitInsights, GitInsights, GitInsightsConfig } from '../src/lib/types'

describe('GitAnalyzer', () => {
  const config: GitInsightsConfig = {
    enabled: true,
    activityWindowDays: 30,
    shortWindowDays: 7,
    staleBranchThresholdDays: 90,
    maxBranches: 5,
    cacheTtlHours: 6,
  }

  it('returns cached insights when head has not changed and cache is fresh', async () => {
    const run = jest.fn(async (args: string[], _options?: any) => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return 'abcdef1234567890'
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`)
    })

    const timestamp = Date.now()
    const cachedInsights: GitInsights = {
      currentBranch: 'main',
      head: { sha: 'abcdef1234567890', author: 'Cam', subject: 'Init', committedAt: timestamp },
      commitsInWindow: { windowDays: 30, count: 5 },
      commitsInShortWindow: { windowDays: 7, count: 2 },
      ahead: 1,
      behind: 0,
      branchSummaries: [],
      staleBranches: { total: 0, sample: [], thresholdDays: 90 },
      collectedAt: timestamp,
    }

    const cached: CachedGitInsights = {
      headSha: 'abcdef1234567890',
      branchFingerprint: 'fingerprint',
      expiresAt: Date.now() + 60_000,
      insights: cachedInsights,
    }

    const analyzer = new GitAnalyzer({ run } as unknown as any)
    const result = await analyzer.collect('/tmp/project', config, cached)

    expect(result?.insights).toBe(cachedInsights)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('collects fresh git insights when cache is missing', async () => {
    const fixedNow = new Date('2024-06-01T00:00:00Z').getTime()
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow)

    let revListCountCalls = 0
    const run = jest.fn(async (args: string[], _options?: any) => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return 'abcdef1234567890'
      }
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === 'HEAD') {
        return 'main'
      }
      if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref' && args[2] === '@{upstream}') {
        return 'origin/main'
      }
      if (args[0] === 'log') {
        return 'abcdef1234567890|Cam|1700000000|Initial commit'
      }
      if (args[0] === 'rev-list' && args[1] === '--count' && args[2] === 'HEAD') {
        revListCountCalls += 1
        return revListCountCalls === 1 ? '5' : '2'
      }
      if (args[0] === 'rev-list' && args.includes('--left-right')) {
        return '2\t1'
      }
      if (args[0] === 'for-each-ref') {
        return [
          `${'main'}|${new Date(fixedNow - 2 * 60 * 60 * 1000).toISOString()}|abcdef1234567890`,
          `${'legacy'}|${new Date(fixedNow - 400 * 24 * 60 * 60 * 1000).toISOString()}|1111111111111111`,
        ].join('\n')
      }
      return null
    })

    const analyzer = new GitAnalyzer({ run } as unknown as any)
    try {
      const result = await analyzer.collect('/tmp/project', { ...config, staleBranchThresholdDays: 365 })

      expect(result).not.toBeNull()
      expect(result?.insights.currentBranch).toBe('main')
      expect(result?.insights.commitsInWindow.count).toBe(5)
      expect(result?.insights.commitsInShortWindow.count).toBe(2)
      expect(result?.insights.ahead).toBe(2)
      expect(result?.insights.behind).toBe(1)
      expect(result?.insights.staleBranches.total).toBe(1)
      expect(result?.insights.staleBranches.sample).toContain('legacy')
      expect(result?.cache.headSha).toBe('abcdef1234567890')
      expect(run).toHaveBeenCalled()
    } finally {
      nowSpy.mockRestore()
    }
  })
})
