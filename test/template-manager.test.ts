import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { TemplateManager } from '../src/lib/templates/manager'
import { ConfigurationManager } from '../src/lib/config/config'
import { ProjectsConfig, TemplateDefinition } from '../src/lib/types'

describe('TemplateManager', () => {
  let config: ProjectsConfig
  let tempDir: string

  beforeEach(async () => {
    const defaults = new ConfigurationManager().getDefaultConfig()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'templates-'))
    config = {
      ...defaults,
      templatesDir: tempDir,
      templates: [],
    }
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('registers a directory as template and writes manifest', async () => {
    const manager = new TemplateManager(config)
    const sourceDir = path.join(tempDir, 'source')
    await fs.mkdir(sourceDir)
    await fs.writeFile(path.join(sourceDir, 'file.txt'), 'hello')

    const stored = await manager.registerFromDirectory(
      sourceDir,
      {
        id: 'custom',
        name: 'Custom',
        description: 'Custom template',
        tags: ['internal'],
        variables: [],
      }
    )

    expect(stored.source.type).toBe('directory')
    if (stored.source.type !== 'directory') {
      throw new Error('Registered template not stored as directory source')
    }
    expect(stored.source.path).toBe('custom')

    const copiedFile = await fs.readFile(path.join(tempDir, 'custom', 'file.txt'), 'utf8')
    expect(copiedFile).toBe('hello')

    const manifestRaw = await fs.readFile(path.join(tempDir, 'custom', 'template.json'), 'utf8')
    const manifest = JSON.parse(manifestRaw)
    expect(manifest.id).toBe('custom')
    expect(manifest.name).toBe('Custom')
  })

  it('resolves registered templates with absolute path', async () => {
    const manager = new TemplateManager(config)
    const sourceDir = path.join(tempDir, 'source')
    await fs.mkdir(sourceDir)
    await fs.writeFile(path.join(sourceDir, 'file.txt'), 'hello')
    const stored = await manager.registerFromDirectory(sourceDir, { id: 'custom', name: 'Custom', variables: [] })
    config.templates = [stored]

    const resolved = await manager.resolve('custom')
    expect(resolved.definition.id).toBe('custom')
    expect(resolved.sourceDir).toBe(path.join(tempDir, 'custom'))
    expect(resolved.manifestPath).toBe(path.join(tempDir, 'custom', 'template.json'))
  })

  it('resolves builtin templates bundled with projector', async () => {
    const defaults = new ConfigurationManager().getDefaultConfig()
    const builtinConfig: ProjectsConfig = { ...defaults }
    const manager = new TemplateManager(builtinConfig)
    const resolved = await manager.resolve('node-service')
    expect(resolved.sourceDir).toContain(path.sep + 'templates' + path.sep + 'node-service')
    const exists = await fs.access(path.join(resolved.sourceDir, 'package.json')).then(
      () => true,
      () => false
    )
    expect(exists).toBe(true)
  })
})
