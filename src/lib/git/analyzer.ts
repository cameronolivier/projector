import * as path from 'path'
import { createHash } from 'crypto'
import { GitCommandRunner } from './command-runner.js'
import { CachedGitInsights, GitBranchSummary, GitHeadInfo, GitInsights, GitInsightsConfig, GitStaleBranchInfo } from '../types.js'

const DAY_IN_MS = 24 * 60 * 60 * 1000

export interface GitInsightResult {
  insights: GitInsights
  cache: CachedGitInsights
}

export class GitAnalyzer {
  constructor(private readonly runner: GitCommandRunner = new GitCommandRunner()) {}

  async collect(projectPath: string, config: GitInsightsConfig, cached?: CachedGitInsights): Promise<GitInsightResult | null> {
    if (!config?.enabled) {
      return null
    }

    const repoPath = path.resolve(projectPath)
    const headSha = (await this.runner.run(['rev-parse', 'HEAD'], { cwd: repoPath, allowFailure: true }))?.trim()
    if (!headSha) {
      return null
    }

    if (cached && this.isCachedInsightValid(cached, headSha)) {
      return { insights: cached.insights, cache: cached }
    }

    const currentBranch = await this.resolveCurrentBranch(repoPath, headSha)
    const headInfo = await this.resolveHeadInfo(repoPath, headSha)
    const commitsInWindow = await this.countCommitsSince(repoPath, config.activityWindowDays)
    const commitsInShortWindow = await this.countCommitsSince(repoPath, config.shortWindowDays)
    const { ahead, behind } = await this.resolveAheadBehind(repoPath)
    const branchSummaries = await this.collectBranchSummaries(repoPath, config.maxBranches)
    const staleBranches = this.computeStaleBranches(branchSummaries, config.staleBranchThresholdDays)

    const insights: GitInsights = {
      currentBranch,
      head: headInfo,
      commitsInWindow: {
        windowDays: config.activityWindowDays,
        count: commitsInWindow,
      },
      commitsInShortWindow: {
        windowDays: config.shortWindowDays,
        count: commitsInShortWindow,
      },
      ahead,
      behind,
      branchSummaries,
      staleBranches,
      collectedAt: Date.now(),
    }

    const cache: CachedGitInsights = {
      headSha,
      branchFingerprint: this.createBranchFingerprint(branchSummaries),
      expiresAt: Date.now() + (config.cacheTtlHours * 60 * 60 * 1000),
      insights,
    }

    return { insights, cache }
  }

  private isCachedInsightValid(cached: CachedGitInsights, headSha: string): boolean {
    if (!cached) {
      return false
    }

    if (cached.headSha !== headSha) {
      return false
    }

    if (cached.expiresAt <= Date.now()) {
      return false
    }

    return true
  }

  private async resolveCurrentBranch(repoPath: string, headSha: string): Promise<string> {
    const branch = await this.runner.run(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath, allowFailure: true })
    if (!branch || branch === 'HEAD') {
      const shortSha = headSha.slice(0, 8)
      return shortSha
    }
    return branch
  }

  private async resolveHeadInfo(repoPath: string, headSha: string): Promise<GitHeadInfo> {
    const logOutput = await this.runner.run(
      ['log', '-1', '--pretty=format:%H|%an|%ct|%s'],
      { cwd: repoPath, allowFailure: true }
    )

    if (!logOutput) {
      return {
        sha: headSha,
        author: 'Unknown',
        subject: 'No commits',
        committedAt: 0,
      }
    }

    const [sha, author, timestamp, subject] = logOutput.split('|')

    return {
      sha: sha || headSha,
      author: author || 'Unknown',
      subject: subject || 'Unknown',
      committedAt: Number.parseInt(timestamp || '0', 10) * 1000,
    }
  }

  private async countCommitsSince(repoPath: string, windowDays: number): Promise<number> {
    if (!windowDays || windowDays <= 0) {
      return 0
    }

    const since = new Date(Date.now() - windowDays * DAY_IN_MS).toISOString()
    const output = await this.runner.run(
      ['rev-list', '--count', 'HEAD', `--since=${since}`],
      { cwd: repoPath, allowFailure: true }
    )

    if (!output) {
      return 0
    }

    return Number.parseInt(output, 10) || 0
  }

  private async resolveAheadBehind(repoPath: string): Promise<{ ahead?: number; behind?: number }> {
    const upstream = await this.runner.run(['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: repoPath, allowFailure: true })
    if (!upstream) {
      return {}
    }

    const counts = await this.runner.run(
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { cwd: repoPath, allowFailure: true }
    )

    if (!counts) {
      return {}
    }

    const [aheadStr, behindStr] = counts.split(/\s+/)
    const ahead = Number.parseInt(aheadStr || '0', 10)
    const behind = Number.parseInt(behindStr || '0', 10)

    return {
      ahead: Number.isNaN(ahead) ? undefined : ahead,
      behind: Number.isNaN(behind) ? undefined : behind,
    }
  }

  private async collectBranchSummaries(repoPath: string, maxBranches: number): Promise<GitBranchSummary[]> {
    if (!maxBranches || maxBranches <= 0) {
      return []
    }

    const output = await this.runner.run(
      [
        'for-each-ref',
        '--format=%(refname:short)|%(committerdate:iso8601)|%(objectname)',
        '--sort=-committerdate',
        `--count=${maxBranches}`,
        'refs/heads',
      ],
      { cwd: repoPath, allowFailure: true, timeoutMs: 5000 }
    )

    if (!output) {
      return []
    }

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, date, sha] = line.split('|')
        return {
          name: name || 'unknown',
          lastCommitDate: date ? Date.parse(date) : 0,
          lastCommitSha: sha || '',
        }
      })
  }

  private computeStaleBranches(branches: GitBranchSummary[], thresholdDays: number): GitStaleBranchInfo {
    if (!thresholdDays || thresholdDays <= 0) {
      return {
        total: 0,
        sample: [],
        thresholdDays,
      }
    }

    const thresholdMs = thresholdDays * DAY_IN_MS
    const now = Date.now()

    const stale = branches.filter((branch) => {
      if (!branch.lastCommitDate) {
        return false
      }
      return now - branch.lastCommitDate >= thresholdMs
    })

    return {
      total: stale.length,
      sample: stale.slice(0, 3).map((branch) => branch.name),
      thresholdDays,
    }
  }

  private createBranchFingerprint(branches: GitBranchSummary[]): string {
    if (!branches || branches.length === 0) {
      return 'none'
    }

    const payload = branches
      .map((branch) => `${branch.name}:${branch.lastCommitSha}`)
      .sort()
      .join('|')

    return createHash('sha1').update(payload).digest('hex')
  }
}
