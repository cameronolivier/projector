import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitCommandOptions {
  cwd: string
  timeoutMs?: number
  allowFailure?: boolean
}

export class GitCommandError extends Error {
  constructor(
    public readonly args: string[],
    public readonly causeError: Error & { code?: number; stdout?: string; stderr?: string }
  ) {
    super(`Git command failed: git ${args.join(' ')}`)
  }

  get stdout(): string {
    return (this.causeError.stdout || '').toString().trim()
  }

  get stderr(): string {
    return (this.causeError.stderr || '').toString().trim()
  }
}

export class GitCommandRunner {
  private gitAvailable: boolean | null = null

  constructor(private readonly defaultTimeoutMs: number = 3000) {}

  async isGitAvailable(): Promise<boolean> {
    if (this.gitAvailable !== null) {
      return this.gitAvailable
    }

    try {
      await execFileAsync('git', ['--version'], {
        timeout: this.defaultTimeoutMs,
      })
      this.gitAvailable = true
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err?.code === 'ENOENT') {
        this.gitAvailable = false
      } else {
        this.gitAvailable = false
      }
    }

    return this.gitAvailable
  }

  async run(args: string[], options: GitCommandOptions): Promise<string | null> {
    const available = await this.isGitAvailable()
    if (!available) {
      return null
    }

    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: options.cwd,
        timeout: options.timeoutMs ?? this.defaultTimeoutMs,
        maxBuffer: 1024 * 1024,
      })
      return stdout.toString().trim()
    } catch (error) {
      const err = error as Error & { code?: number; stdout?: string; stderr?: string }

      if (this.shouldTreatAsMissingRepository(err) || options.allowFailure) {
        return null
      }

      throw new GitCommandError(args, err)
    }
  }

  private shouldTreatAsMissingRepository(error: { code?: number; stderr?: string }): boolean {
    if (!error) {
      return false
    }

    if (error.code === 128) {
      return true
    }

    const stderr = (error.stderr || '').toString()
    return /not a git repository/i.test(stderr)
  }
}
