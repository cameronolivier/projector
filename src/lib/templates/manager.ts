import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ProjectsConfig, TemplateDefinition } from '../types.js'

export interface ResolvedTemplate {
  definition: TemplateDefinition
  sourceDir: string
  manifestPath: string | null
  isBuiltin: boolean
}

const DEFAULT_EXPORT_IGNORES = new Set(['node_modules', '.git', '.turbo', '.next', 'dist', 'build'])

export class TemplateManager {
  constructor(private config: ProjectsConfig) {}

  async list(): Promise<TemplateDefinition[]> {
    const templates = this.config.templates || []
    const map = new Map<string, TemplateDefinition>()
    for (const tpl of templates) {
      if (map.has(tpl.id)) {
        throw new Error(`Duplicate template id detected: ${tpl.id}`)
      }
      map.set(tpl.id, tpl)
    }
    return Array.from(map.values())
  }

  async resolve(id: string): Promise<ResolvedTemplate> {
    const catalog = await this.list()
    const definition = catalog.find((tpl) => tpl.id === id)
    if (!definition) {
      throw new Error(`Template not found: ${id}`)
    }

    const { sourceDir, manifestPath, isBuiltin } = await this.resolveSource(definition)
    return {
      definition,
      sourceDir,
      manifestPath,
      isBuiltin,
    }
  }

  async registerFromDirectory(
    sourceDir: string,
    definition: Omit<TemplateDefinition, 'source'> & { id: string },
    options: { overwrite?: boolean } = {}
  ): Promise<TemplateDefinition> {
    const normalizedSource = path.resolve(sourceDir)
    const stats = await fs.stat(normalizedSource).catch(() => {
      throw new Error(`Template source directory not found: ${normalizedSource}`)
    })
    if (!stats.isDirectory()) {
      throw new Error(`Template source must be a directory: ${normalizedSource}`)
    }

    const templatesDir = await this.ensureTemplatesDir()
    const destinationDir = path.join(templatesDir, definition.id)
    const destinationExists = await this.exists(destinationDir)
    if (destinationExists) {
      if (!options.overwrite) {
        throw new Error(`Template "${definition.id}" already exists. Use overwrite option to replace it.`)
      }
      await fs.rm(destinationDir, { recursive: true, force: true })
    }

    await fs.mkdir(destinationDir, { recursive: true })
    await this.copyDirectory(normalizedSource, destinationDir)

    const manifest = {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      tags: definition.tags,
      variables: definition.variables,
      postCommands: definition.postCommands,
      initGit: definition.initGit,
      exportedAt: new Date().toISOString(),
      source: 'directory',
    }
    await fs.writeFile(path.join(destinationDir, 'template.json'), JSON.stringify(manifest, null, 2), 'utf8')

    const stored: TemplateDefinition = {
      ...definition,
      source: { type: 'directory', path: definition.id },
    }

    return stored
  }

  private async ensureTemplatesDir(): Promise<string> {
    const baseDir = this.config.templatesDir || path.join(os.homedir(), '.config', 'projector', 'templates')
    await fs.mkdir(baseDir, { recursive: true })
    return baseDir
  }

  private async resolveSource(definition: TemplateDefinition): Promise<{ sourceDir: string; manifestPath: string | null; isBuiltin: boolean }> {
    if (definition.source.type === 'builtin') {
      const templatesRoot = path.resolve(__dirname, '../../templates')
      const sourceDir = path.join(templatesRoot, definition.source.builtinId)
      const exists = await this.exists(sourceDir)
      if (!exists) {
        throw new Error(`Builtin template assets missing for ${definition.id} (expected at ${sourceDir})`)
      }
      const manifestPath = await this.findManifest(sourceDir)
      return { sourceDir, manifestPath, isBuiltin: true }
    }

    const templatesDir = await this.ensureTemplatesDir()
    const configuredPath = definition.source.path
    const resolved = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(templatesDir, configuredPath)

    const exists = await this.exists(resolved)
    if (!exists) {
      throw new Error(`Template directory not found for ${definition.id}: ${resolved}`)
    }

    const manifestPath = await this.findManifest(resolved)
    return { sourceDir: resolved, manifestPath, isBuiltin: false }
  }

  private async findManifest(dir: string): Promise<string | null> {
    const manifest = path.join(dir, 'template.json')
    return (await this.exists(manifest)) ? manifest : null
  }

  private async copyDirectory(source: string, destination: string): Promise<void> {
    const entries = await fs.readdir(source, { withFileTypes: true })
    for (const entry of entries) {
      if (DEFAULT_EXPORT_IGNORES.has(entry.name)) continue
      const srcPath = path.join(source, entry.name)
      const destPath = path.join(destination, entry.name)
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true })
        await this.copyDirectory(srcPath, destPath)
      } else {
        const data = await fs.readFile(srcPath)
        await fs.writeFile(destPath, data)
      }
    }
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }
}
