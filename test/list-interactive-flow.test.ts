import * as child_process from 'child_process'

// Utility: import after setting mocks
const importAfterMocks = async <T>(path: string): Promise<T> => {
  return (await import(path)) as unknown as T
}

describe('list command - interactive flow', () => {
  const realIsTTY = { 
    out: process.stdout.isTTY, 
    inp: process.stdin.isTTY 
  }
  let injectedFlags: any

  beforeEach(() => {
    ;(process.stdout as any).isTTY = true
    ;(process.stdin as any).isTTY = true
    injectedFlags = {}
    jest.resetModules()
    jest.restoreAllMocks()
  })

  afterEach(() => {
    // Properly restore TTY state
    ;(process.stdout as any).isTTY = realIsTTY.out
    ;(process.stdin as any).isTTY = realIsTTY.inp
    
    // Clean up any lingering handles
    jest.clearAllMocks()
  })

  const mockOclifCore = () => {
    jest.doMock('@oclif/core', () => {
      class BaseCommand {
        // parse returns injected flags
        async parse() {
          return { flags: injectedFlags }
        }
        log = (_msg?: any) => {}
        warn = (_msg?: any) => {}
        exit = (_code?: number) => {}
        error(message: string) {
          throw new Error(message)
        }
      }
      const Flags = {
        string: (_: any) => ({}),
        integer: (_: any) => ({}),
        boolean: (_: any) => ({}),
      }
      return { __esModule: true, Command: BaseCommand, Flags }
    })
  }

  const mockDeps = (opts?: { projects?: any[]; defaultEditor?: string }) => {
    const projects = opts?.projects || [
      { name: 'proj', path: '/abs/proj' },
    ]
    jest.doMock('../src/lib/discovery/scanner', () => ({
      __esModule: true,
      ProjectScanner: jest.fn().mockImplementation(() => ({
        scanDirectory: async () => projects,
      })),
    }))
    jest.doMock('../src/lib/discovery/detector', () => ({
      __esModule: true,
      TypeDetector: jest.fn().mockImplementation(() => ({
        detectProjectType: () => 'nodejs',
        detectLanguages: () => ['ts'],
        hasGitRepository: () => true,
      })),
    }))
    jest.doMock('../src/lib/tracking/analyzer', () => ({
      __esModule: true,
      TrackingAnalyzer: jest.fn().mockImplementation(() => ({
        analyzeProject: async () => ({ type: 'active', details: '', confidence: 90 }),
        detectTrackingFiles: async () => [],
      })),
    }))
    jest.doMock('../src/lib/output/table', () => ({
      __esModule: true,
      TableGenerator: jest.fn().mockImplementation(() => ({
        generateTable: () => 'TABLE',
        generateSummary: () => 'SUMMARY',
        generateGitDetails: () => null,
      })),
    }))
    jest.doMock('../src/lib/git/analyzer', () => ({
      __esModule: true,
      GitAnalyzer: jest.fn().mockImplementation(() => ({
        collect: async () => null,
      })),
    }))
    jest.doMock('../src/lib/cache/manager', () => ({
      __esModule: true,
      CacheManager: jest.fn().mockImplementation(() => ({
        clearCache: async () => {},
        getCachedProject: async () => null,
        setCachedProject: async () => {},
        updateGitInsights: async () => {},
        getStats: () => ({ totalProjects: 0, cacheHits: 0, cacheMisses: 0, invalidated: 0, cacheHitRate: 0 }),
      })),
    }))
    jest.doMock('../src/lib/config/config', () => ({
      __esModule: true,
      ConfigurationManager: jest.fn().mockImplementation(() => ({
        loadConfig: async () => ({
          scanDirectory: '/root',
          maxDepth: 3,
          descriptions: {},
          trackingPatterns: [],
          ignorePatterns: [],
          codeFileExtensions: [],
          defaultInteractive: true,
          defaultEditor: opts?.defaultEditor,
          cdSentinel: '__PROJECTOR_CD__',
          gitInsights: { enabled: false, activityWindowDays: 30, shortWindowDays: 7, staleBranchThresholdDays: 90, maxBranches: 5, cacheTtlHours: 6 },
        }),
      })),
    }))
  }

  const mockPrompts = (answers: any[]) => {
    const queue = [...answers]
    jest.doMock('inquirer', () => ({
      __esModule: true,
      default: { prompt: jest.fn(() => Promise.resolve(queue.shift())) },
    }))
  }

  it('emits cd sentinel and exits(0)', async () => {
    mockOclifCore()
    mockDeps()
    mockPrompts([
      { projectPath: '/abs/proj' },
      { action: 'cd' },
    ])
    injectedFlags = {}
    const { default: List } = await importAfterMocks<any>('../src/commands/list')
    const list = new (List as any)()
    const logSpy = jest.spyOn(list as any, 'log').mockImplementation(() => {})
    const exitSpy = jest.spyOn(list as any, 'exit').mockImplementation(() => {})
    await list.run()
    expect(logSpy).toHaveBeenCalledWith('__PROJECTOR_CD__ /abs/proj')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('spawns editor for open-default using buildEditorCommand', async () => {
    mockOclifCore()
    mockDeps({ defaultEditor: 'code' })
    mockPrompts([
      { projectPath: '/abs/proj' },
      { action: 'open-default' },
    ])
    jest.doMock('../src/lib/commands/open-utils', () => ({
      __esModule: true,
      buildEditorCommand: () => ({ cmd: 'code', args: ['/abs/proj'] }),
      defaultEditorFromEnv: () => 'code',
      supportedEditors: () => ['code'],
      isGuiEditor: () => true,
    }))
    const spawnSpy = jest.fn().mockReturnValue({ on: () => {} } as any)
    jest.doMock('child_process', () => ({ __esModule: true, spawn: spawnSpy }))
    const { default: List } = await importAfterMocks<any>('../src/commands/list')
    const list = new (List as any)()
    await list.run()
    expect(spawnSpy).toHaveBeenCalledWith('code', ['/abs/proj'], expect.objectContaining({ shell: expect.any(Boolean) }))
  })

  it('spawns chosen editor for open-choose using buildEditorCommand', async () => {
    mockOclifCore()
    mockDeps({ defaultEditor: 'code' })
    mockPrompts([
      { projectPath: '/abs/proj' },
      { action: 'open-choose' },
      { editor: 'webstorm' },
    ])
    jest.doMock('../src/lib/commands/open-utils', () => ({
      __esModule: true,
      buildEditorCommand: (_editor: string, _path: string, _opts: any) => ({ cmd: 'webstorm', args: ['/abs/proj'] }),
      defaultEditorFromEnv: () => 'code',
      supportedEditors: () => ['code', 'webstorm'],
      isGuiEditor: () => true,
    }))
    const spawnSpy = jest.fn().mockReturnValue({ on: () => {} } as any)
    jest.doMock('child_process', () => ({ __esModule: true, spawn: spawnSpy }))
    const { default: List } = await importAfterMocks<any>('../src/commands/list')
    const list = new (List as any)()
    await list.run()
    expect(spawnSpy).toHaveBeenCalledWith('webstorm', ['/abs/proj'], expect.objectContaining({ shell: expect.any(Boolean) }))
  })

  it('honors --no-interactive to disable prompts', async () => {
    mockOclifCore()
    mockDeps()
    const promptMock = { prompt: jest.fn() }
    jest.doMock('inquirer', () => ({ __esModule: true, default: promptMock }))
    injectedFlags = { 'no-interactive': true }
    const { default: List } = await importAfterMocks<any>('../src/commands/list')
    const list = new (List as any)()
    await list.run()
    expect(promptMock.prompt).not.toHaveBeenCalled()
  })

  it('does not prompt in non-TTY even when --interactive is set', async () => {
    ;(process.stdout as any).isTTY = false
    ;(process.stdin as any).isTTY = false
    mockOclifCore()
    mockDeps()
    const promptMock = { prompt: jest.fn() }
    jest.doMock('inquirer', () => ({ __esModule: true, default: promptMock }))
    injectedFlags = { interactive: true }
    const { default: List } = await importAfterMocks<any>('../src/commands/list')
    const list = new (List as any)()
    await list.run()
    expect(promptMock.prompt).not.toHaveBeenCalled()
  })
})
