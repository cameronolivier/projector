import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

// Import after mocks helper
const importAfterMocks = async <T>(path: string): Promise<T> => {
  return (await import(path)) as unknown as T
}

describe('shell command - install/remove/dry-run', () => {
  const realIsTTY = { out: process.stdout.isTTY, inp: process.stdin.isTTY }
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

  afterEach(() => {
    ;(process.stdout as any).isTTY = realIsTTY.out
    ;(process.stdin as any).isTTY = realIsTTY.inp
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

  it('dry-run install prints a wrapper block', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
    injectedFlags = { install: true, 'dry-run': true, rc: rcPath, shell: 'zsh' }
    const { default: ShellCmd } = await importAfterMocks<any>('../src/commands/shell')
    const cmd = new (ShellCmd as any)()
    const outputs: string[] = []
    jest.spyOn(cmd as any, 'log').mockImplementation((...args: unknown[]) => { outputs.push(args.map(String).join(' ')) })
    await cmd.run()
    expect(outputs.join('\n')).toContain('# >>> projector wrapper >>>')
    expect(outputs.join('\n')).toContain('# <<< projector wrapper <<<')
    expect(outputs.join('\n')).toContain('__PROJECTOR_CD__')
  })

  it('install is idempotent and creates backups', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
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
  })

  it('dry-run remove shows block, and remove deletes it with backup', async () => {
    mockOclifCore()
    mockConfig()
    mockChalk()
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
  })
})
