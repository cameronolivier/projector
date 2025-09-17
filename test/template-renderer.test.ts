import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { TemplateRenderer } from '../src/lib/templates/renderer'
import { TemplateDefinition } from '../src/lib/types'
import { ResolvedTemplate } from '../src/lib/templates/manager'

describe('TemplateRenderer', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'renderer-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  function createResolvedTemplate(templateDir: string, definition: TemplateDefinition): ResolvedTemplate {
    return {
      definition,
      sourceDir: templateDir,
      manifestPath: null,
      isBuiltin: false,
    }
  }

  it('renders template files with variables and metadata', async () => {
    const templateDir = path.join(tempDir, 'template')
    await fs.mkdir(templateDir, { recursive: true })
    await fs.writeFile(path.join(templateDir, 'hello.txt'), 'Hello {{name}}!')
    await fs.writeFile(path.join(templateDir, '__slug__-note.md'), '# ${title}')

    const definition: TemplateDefinition = {
      id: 'demo',
      name: 'Demo',
      source: { type: 'directory', path: 'demo' },
      variables: [
        { key: 'name', prompt: 'Name', required: true },
        { key: 'slug', prompt: 'Slug', default: 'entry' },
        { key: 'title', prompt: 'Title', default: 'Untitled' },
      ],
    }

    const renderer = new TemplateRenderer()
    const targetDir = path.join(tempDir, 'output')
    const result = await renderer.render(
      createResolvedTemplate(templateDir, definition),
      targetDir,
      { variables: { name: 'World', slug: 'welcome', title: 'Greetings' } }
    )

    const greeting = await fs.readFile(path.join(targetDir, 'hello.txt'), 'utf8')
    expect(greeting).toBe('Hello World!')
    const note = await fs.readFile(path.join(targetDir, 'welcome-note.md'), 'utf8')
    expect(note.trim()).toBe('# Greetings')
    expect(result.filesWritten).toEqual(
      expect.arrayContaining([
        path.join(targetDir, 'hello.txt'),
        path.join(targetDir, 'welcome-note.md'),
        path.join(targetDir, '.projector-template.json'),
      ])
    )
    const metadataRaw = await fs.readFile(path.join(targetDir, '.projector-template.json'), 'utf8')
    const metadata = JSON.parse(metadataRaw)
    expect(metadata.templateId).toBe('demo')
    expect(metadata.variables).toMatchObject({ name: 'World', slug: 'welcome', title: 'Greetings' })
  })

  it('runs post commands using injected runner', async () => {
    const templateDir = path.join(tempDir, 'template')
    await fs.mkdir(templateDir, { recursive: true })
    await fs.writeFile(path.join(templateDir, 'file.txt'), 'ok')

    const runCommand = jest.fn().mockResolvedValue(undefined)
    const definition: TemplateDefinition = {
      id: 'cmd',
      name: 'Cmd',
      source: { type: 'directory', path: 'cmd' },
      postCommands: ['echo done'],
    }

    const renderer = new TemplateRenderer(runCommand)
    const targetDir = path.join(tempDir, 'output')
    await renderer.render(createResolvedTemplate(templateDir, definition), targetDir, { variables: {} })

    expect(runCommand).toHaveBeenCalledWith('echo done', targetDir)
  })

  it('throws when required variables missing', async () => {
    const templateDir = path.join(tempDir, 'template')
    await fs.mkdir(templateDir, { recursive: true })

    const definition: TemplateDefinition = {
      id: 'vars',
      name: 'Vars',
      source: { type: 'directory', path: 'vars' },
      variables: [{ key: 'serviceName', prompt: 'Service name', required: true }],
    }

    const renderer = new TemplateRenderer()
    const targetDir = path.join(tempDir, 'output')
    await expect(
      renderer.render(createResolvedTemplate(templateDir, definition), targetDir, { variables: {} })
    ).rejects.toThrow('Missing required variable: serviceName')
  })

  it('supports dry-run without touching filesystem', async () => {
    const templateDir = path.join(tempDir, 'template')
    await fs.mkdir(templateDir, { recursive: true })
    await fs.writeFile(path.join(templateDir, 'hello.txt'), 'hi')

    const definition: TemplateDefinition = {
      id: 'dry',
      name: 'Dry',
      source: { type: 'directory', path: 'dry' },
    }

    const renderer = new TemplateRenderer()
    const targetDir = path.join(tempDir, 'output')
    const result = await renderer.render(createResolvedTemplate(templateDir, definition), targetDir, {
      variables: {},
      dryRun: true,
    })

    const exists = await fs.access(path.join(targetDir, 'hello.txt')).then(
      () => true,
      () => false
    )
    expect(exists).toBe(false)
    expect(result.filesWritten).toEqual([path.join(targetDir, 'hello.txt')])
  })
})
