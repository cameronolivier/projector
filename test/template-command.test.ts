const importAfterMocks = async <T>(modulePath: string): Promise<T> => {
  return (await import(modulePath)) as unknown as T
}

describe('template command', () => {
  let parseResult: { args: any; flags: any }

  beforeEach(() => {
    jest.resetModules()
    parseResult = { args: { action: 'list' }, flags: {} }
  })

  const mockOclif = () => {
    jest.doMock('@oclif/core', () => {
      class BaseCommand {
        async parse() {
          return parseResult
        }
        log = jest.fn()
        warn = jest.fn()
        exit = jest.fn()
        error(message: string): never {
          throw new Error(message)
        }
      }
      const Flags = {
        string: jest.fn(() => ({})),
        boolean: jest.fn(() => ({})),
      }
      const Args = {
        string: jest.fn(() => ({})),
      }
      return { __esModule: true, Command: BaseCommand, Flags, Args }
    })
  }

  const mockConfigManager = () => {
    jest.doMock('../src/lib/config/config.js', () => ({
      __esModule: true,
      ConfigurationManager: jest.fn(() => ({
        loadConfig: jest.fn().mockResolvedValue({ templates: [], templatesDir: '/tmp/templates' }),
        saveConfig: jest.fn().mockResolvedValue(undefined),
        getPath: () => '/tmp/config.yaml',
      })),
    }))
  }

  it('outputs templates as JSON when --json flag provided', async () => {
    parseResult = { args: { action: 'list' }, flags: { json: true } }
    const listMock = jest.fn().mockResolvedValue([
      { id: 'node', name: 'Node', source: { type: 'builtin', builtinId: 'node' }, tags: ['service'], description: 'Node service' },
    ])

    mockOclif()
    mockConfigManager()
    jest.doMock('chalk', () => ({
      __esModule: true,
      default: {
        green: (v: string) => v,
        gray: (v: string) => v,
        cyan: (v: string) => v,
        yellow: (v: string) => v,
      },
    }))

    jest.doMock('../src/lib/templates/index.js', () => ({
      __esModule: true,
      TemplateManager: jest.fn(() => ({ list: listMock })),
      TemplateRenderer: jest.fn(),
    }))

    const { default: TemplateCommand } = await importAfterMocks<any>('../src/commands/template')
    const cmd = new (TemplateCommand as any)()
    await cmd.run()

    expect(listMock).toHaveBeenCalledTimes(1)
    const output = (cmd.log as any).mock.calls.map((call: any[]) => call[0]).join('\n')
    expect(output).toContain('Node service')
  })

  it('passes flags to renderer when applying template', async () => {
    parseResult = {
      args: { action: 'apply' },
      flags: { template: 'demo', target: '/tmp/out', var: ['name=service'], force: true, 'skip-post': true },
    }

    const listMock = jest.fn().mockResolvedValue([
      {
        id: 'demo',
        name: 'Demo',
        source: { type: 'builtin', builtinId: 'demo' },
        variables: [{ key: 'name', prompt: 'Name', required: true }],
      },
    ])
    const resolveMock = jest.fn().mockResolvedValue({
      definition: {
        id: 'demo',
        name: 'Demo',
        source: { type: 'builtin', builtinId: 'demo' },
        variables: [{ key: 'name', prompt: 'Name', required: true }],
      },
      sourceDir: '/tmp/template',
      manifestPath: null,
      isBuiltin: true,
    })
    const renderMock = jest.fn().mockResolvedValue({ filesWritten: [], commandsRun: [] })

    mockOclif()
    mockConfigManager()
    jest.doMock('chalk', () => ({
      __esModule: true,
      default: {
        green: (v: string) => v,
        gray: (v: string) => v,
        cyan: (v: string) => v,
        yellow: (v: string) => v,
      },
    }))

    jest.doMock('../src/lib/templates/index.js', () => ({
      __esModule: true,
      TemplateManager: jest.fn(() => ({ list: listMock, resolve: resolveMock })),
      TemplateRenderer: jest.fn(() => ({ render: renderMock })),
    }))

    jest.doMock('../src/lib/templates/prompts.js', () => ({
      __esModule: true,
      promptForTemplateId: jest.fn(),
      promptForTargetDirectory: jest.fn(),
      promptForVariables: jest.fn((_definition: any, vars: Record<string, string>) => Promise.resolve(vars)),
    }))

    const { default: TemplateCommand } = await importAfterMocks<any>('../src/commands/template')
    const cmd = new (TemplateCommand as any)()
    await cmd.run()

    expect(renderMock).toHaveBeenCalledWith(expect.any(Object), '/tmp/out', {
      force: true,
      skipPostCommands: true,
      dryRun: undefined,
      variables: { name: 'service' },
    })
  })
})
