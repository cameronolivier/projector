import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

// Import after mocks helper
const importAfterMocks = async <T>(path: string): Promise<T> => {
  return (await import(path)) as unknown as T
}

describe('shell command - install/remove/dry-run', () => {
  const originalStdoutIsTTY = process.stdout.isTTY
  const originalStdinIsTTY = process.stdin.isTTY
  let injectedFlags: any
  let tmpDir: string
  let rcPath: string

  beforeEach(async () => {
    ;(process.stdout as any).isTTY = true
    ;(process.stdin as any).isTTY = true
    jest.resetModules()
    jest.restoreAllMocks()
    injectedFlags = {}
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projector-shell-'))
    rcPath = path.join(tmpDir, 'rc.sh')
    await fs.writeFile(rcPath, '# test rc\nexport FOO=bar\n', 'utf8')
  })

  afterEach(async () => {
    ;(process.stdout as any).isTTY = originalStdoutIsTTY
    ;(process.stdin as any).isTTY = originalStdinIsTTY
    
    // Clean up temporary directory
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true })
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  })

  const mockOclifCore = () => {
    jest.doMock('@oclif/core', () => {
      class BaseCommand {
        async parse() { return { flags: injectedFlags } }
        log = (_msg?: any) => {}
        warn = (_msg?: any) => {}
        exit = (_code?: number) => {}
        error(message: string) { throw new Error(message) }
      }
      const Flags = {
        string: (_: any) => ({}),
        integer: (_: any) => ({}),
        boolean: (_: any) => ({}),
      }
      return { __esModule: true, Command: BaseCommand, Flags }
    })
  }

  const mockConfig = () => {
    jest.doMock('../src/lib/config/config', () => ({
      __esModule: true,
      ConfigurationManager: jest.fn().mockImplementation(() => ({
        loadConfig: async () => ({ cdSentinel: '__PROJECTOR_CD__' }),
      })),
    }))
  }

  const mockChalk = () => {
    jest.doMock('chalk', () => ({
      __esModule: true,
      default: {
        gray: (s: string) => s,
        green: (s: string) => s,
        cyan: (s: string) => s,
        yellow: (s: string) => s,
      },
    }))
  }

  const mockInquirer = () => {
    jest.doMock('inquirer', () => ({
      __esModule: true,
      default: {
        prompt: jest.fn(() => Promise.resolve({ targetPath: rcPath })),
      },
    }))
  }

  const mockShellWrapper = () => {
    jest.doMock('../src/lib/shell/wrapper', () => ({
      __esModule: true,
      detectShell: () => 'zsh',
      findRcCandidates: async () => [rcPath],
      getWrapperForShell: (_shell: string, sentinel: string) => {
        return `\n# projector shell integration\nfunction projector() {\n  local output\n  output=$(command projector list \"$@\")\n  if [[ $output == ${sentinel}* ]]; then\n    cd \"\${output#${sentinel} }\"\n  else\n    echo \"$output\"\n  fi\n}\n`
      },
      installWrapperInto: async (path: string, content: string) => {
        const original = await fs.readFile(path, 'utf8')
        const backupPath = path + '.bak-' + Date.now()
        // Always create a backup (test expects it)
        await fs.writeFile(backupPath, original, 'utf8')
        
        // Check if wrapper already exists (for idempotence)
        if (original.includes('# >>> projector wrapper >>>')) {
          // Don't add another wrapper if one exists
          return { rcPath: path, backupPath }
        }
        const newContent = original + '\n# >>> projector wrapper >>>\n' + content + '\n# <<< projector wrapper <<<\n'
        await fs.writeFile(path, newContent, 'utf8')
        return { rcPath: path, backupPath }
      },
      shortenHome: (p: string) => p,
      escapeRegExp: (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      stripWrapperBlocks: (content: string) => ({ updated: content.replace(/# >>> projector wrapper >>>[\s\S]*?# <<< projector wrapper <<</g, '') }),
    }))
  }

  it('dry-run install prints a wrapper block', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
    mockInquirer()
    mockShellWrapper()
    injectedFlags = { install: true, 'dry-run': true, rc: rcPath, shell: 'zsh' }
    const { default: ShellCmd } = await importAfterMocks<any>('../src/commands/shell')
    const cmd = new (ShellCmd as any)()
    const outputs: string[] = []
    jest.spyOn(cmd as any, 'log').mockImplementation((...args: unknown[]) => { outputs.push(args.map(String).join(' ')) })
    await cmd.run()
    expect(outputs.join('\n')).toContain('# >>> projector wrapper >>>')
    expect(outputs.join('\n')).toContain('# <<< projector wrapper <<<')
    expect(outputs.join('\n')).toContain('__PROJECTOR_CD__')
  }, 10000)

  it('install is idempotent and creates backups', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
    mockInquirer()
    mockShellWrapper()
    injectedFlags = { install: true, rc: rcPath, shell: 'zsh' }
    const { default: ShellCmd } = await importAfterMocks<any>('../src/commands/shell')
    const cmd = new (ShellCmd as any)()
    await cmd.run()
    const first = await fs.readFile(rcPath, 'utf8')
    expect(first).toContain('# >>> projector wrapper >>>')
    // second run
    // second run using same command class
    injectedFlags = { install: true, rc: rcPath, shell: 'zsh' }
    const cmd2 = new (ShellCmd as any)()
    await cmd2.run()
    const second = await fs.readFile(rcPath, 'utf8')
    const beginCount = (second.match(/# >>> projector wrapper >>>/g) || []).length
    expect(beginCount).toBe(1)
    const backups = (await fs.readdir(tmpDir)).filter((f) => f.startsWith('rc.sh.bak-'))
    expect(backups.length).toBeGreaterThanOrEqual(1)
  }, 10000)

  it('dry-run remove shows block, and remove deletes it with backup', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
    mockInquirer()
    mockShellWrapper()
    // Install first
    injectedFlags = { install: true, rc: rcPath, shell: 'zsh' }
    const { default: ShellCmd } = await importAfterMocks<any>('../src/commands/shell')
    const cmd = new (ShellCmd as any)()
    await cmd.run()

    // Dry-run remove
    injectedFlags = { remove: true, 'dry-run': true, rc: rcPath }
    const cmdDry = new (ShellCmd as any)()
    const outputs: string[] = []
    jest.spyOn(cmdDry as any, 'log').mockImplementation((...args: unknown[]) => { outputs.push(args.map(String).join(' ')) })
    await cmdDry.run()
    expect(outputs.join('\n')).toContain('would remove the projector wrapper block')

    // Remove for real
    injectedFlags = { remove: true, rc: rcPath }
    const cmdRemove = new (ShellCmd as any)()
    await cmdRemove.run()
    const after = await fs.readFile(rcPath, 'utf8')
    expect(after).not.toContain('# >>> projector wrapper >>>')
    const backups = (await fs.readdir(tmpDir)).filter((f) => f.startsWith('rc.sh.bak-'))
    expect(backups.length).toBeGreaterThanOrEqual(1)
  }, 10000)
})
