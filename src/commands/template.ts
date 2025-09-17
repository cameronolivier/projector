import { Args, Command, Flags } from '@oclif/core'
import Table from 'cli-table3'
import chalk from 'chalk'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ConfigurationManager } from '../lib/config/config.js'
import { TemplateManager, TemplateRenderer } from '../lib/templates/index.js'
import { promptForTemplateId, promptForTargetDirectory, promptForVariables } from '../lib/templates/prompts.js'
import { ProjectsConfig, TemplateDefinition } from '../lib/types.js'

interface ListFlags {
  json?: boolean
}

interface ApplyFlags {
  template?: string
  target?: string
  force?: boolean
  'skip-post'?: boolean
  'dry-run'?: boolean
  var?: string[]
  vars?: string
}

interface AddFlags {
  from?: string
  id?: string
  name?: string
  description?: string
  tag?: string[]
  overwrite?: boolean
}

export default class Template extends Command {
  static override summary = 'Manage project templates, scaffold projects, and register new templates'

  static override description = 'Create and manage reusable project templates. Supports listing, applying, and adding templates.'

  static override examples = [
    {
      description: 'List all available templates',
      command: '<%= config.bin %> template list',
    },
    {
      description: 'Apply a template into ./my-service with interactive prompts',
      command: '<%= config.bin %> template apply --template node-service --target ./my-service',
    },
    {
      description: 'Apply a template non-interactively with variables provided via flags',
      command: '<%= config.bin %> template apply --template node-service --target ./api --var serviceName=api --var description="Internal API" --skip-post',
    },
    {
      description: 'Register a directory as a reusable template',
      command: '<%= config.bin %> template add --from ./scaffold --id my-template --name "My template"',
    },
  ]

  static override args = {
    action: Args.string({
      description: 'Template action to run',
      options: ['list', 'apply', 'init', 'add'],
      required: true,
    }),
  }

  static override flags = {
    json: Flags.boolean({ description: 'Output JSON for list command' }),
    template: Flags.string({ char: 't', description: 'Template id to apply' }),
    target: Flags.string({ char: 'd', description: 'Directory to scaffold into' }),
    force: Flags.boolean({ description: 'Allow applying into non-empty directory' }),
    'skip-post': Flags.boolean({ description: 'Skip running template post-generation commands' }),
    'dry-run': Flags.boolean({ description: 'Simulate apply without writing files' }),
    var: Flags.string({ description: 'Variable assignment (key=value)', multiple: true }),
    vars: Flags.string({ description: 'Path to JSON file with variable assignments' }),
    from: Flags.string({ description: 'Source directory to register as template (add command)' }),
    id: Flags.string({ description: 'Template id when adding new template' }),
    name: Flags.string({ description: 'Human-readable template name when adding' }),
    description: Flags.string({ description: 'Description for template when adding' }),
    tag: Flags.string({ description: 'Tag for template (repeatable)', multiple: true }),
    overwrite: Flags.boolean({ description: 'Overwrite existing template with same id when adding' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Template)
    const configManager = new ConfigurationManager()
    const config = await configManager.loadConfig()
    const manager = new TemplateManager(config)

    switch (args.action) {
      case 'list':
        await this.handleList(manager, flags as ListFlags)
        break
      case 'apply':
      case 'init':
        await this.handleApply(manager, flags as ApplyFlags)
        break
      case 'add':
        await this.handleAdd(configManager, config, manager, flags as AddFlags)
        break
      default:
        this.error(`Unsupported action: ${args.action}`)
    }
  }

  private async handleList(manager: TemplateManager, flags: ListFlags): Promise<void> {
    const templates = await manager.list()
    if (flags.json) {
      this.log(JSON.stringify(templates, null, 2))
      return
    }

    if (templates.length === 0) {
      this.log(chalk.yellow('No templates available. Add templates with "projector template add".'))
      return
    }

    const table = new Table({ head: ['ID', 'Name', 'Type', 'Tags', 'Description'] })
    for (const tpl of templates) {
      table.push([
        tpl.id,
        tpl.name,
        tpl.source.type,
        tpl.tags && tpl.tags.length > 0 ? tpl.tags.join(', ') : '—',
        tpl.description ?? '—',
      ])
    }

    this.log(table.toString())
  }

  private async handleApply(manager: TemplateManager, flags: ApplyFlags): Promise<void> {
    const templates = await manager.list()
    const templateId = flags.template || (await promptForTemplateId(templates))
    const resolved = await manager.resolve(templateId)

    const inlineVars = this.parseVariableAssignments(flags.var)
    const fileVars = flags.vars ? await this.loadVariableFile(flags.vars) : {}
    const combinedVars = { ...fileVars, ...inlineVars }
    const variables = await promptForVariables(resolved.definition, combinedVars)

    const targetDir = await this.resolveTargetDirectory(flags.target)
    const renderer = new TemplateRenderer()
    const result = await renderer.render(resolved, targetDir, {
      force: flags.force,
      skipPostCommands: flags['skip-post'],
      dryRun: flags['dry-run'],
      variables,
    })

    if (flags['dry-run']) {
      this.log(chalk.green(`Dry run successful for template ${resolved.definition.name}.`))
      this.log(`Files that would be written:`)
      for (const file of result.filesWritten) {
        this.log(`  • ${file}`)
      }
    } else {
      this.log(chalk.green(`Template ${resolved.definition.name} applied to ${targetDir}`))
      if (result.metadataPath) {
        this.log(chalk.gray(`Metadata recorded at ${result.metadataPath}`))
      }
      if (result.commandsRun.length > 0) {
        this.log(chalk.gray(`Post commands executed:`))
        for (const cmd of result.commandsRun) {
          this.log(`  • ${cmd}`)
        }
      }
    }
  }

  private async handleAdd(
    configManager: ConfigurationManager,
    config: ProjectsConfig,
    manager: TemplateManager,
    flags: AddFlags
  ): Promise<void> {
    if (!flags.from) {
      this.error('Specify the source directory via --from')
    }
    if (!flags.id) {
      this.error('Specify a template id via --id')
    }

    const name = flags.name || flags.id
    const tags = flags.tag || []
    const storedDefinition = await manager.registerFromDirectory(
      flags.from,
      {
        id: flags.id,
        name,
        description: flags.description,
        tags,
        variables: [],
      },
      { overwrite: flags.overwrite }
    )

    const existing = config.templates || []
    const updated = existing.filter((tpl: TemplateDefinition) => tpl.id !== storedDefinition.id)
    updated.push(storedDefinition)
    config.templates = updated

    if (!config.templatesDir) {
      // Ensure templatesDir persists in config (defaults may not be serialized yet)
      const configDir = path.dirname(configManager.getPath())
      config.templatesDir = path.join(configDir, 'templates')
    }

    await configManager.saveConfig(config)

    this.log(chalk.green(`Template ${storedDefinition.name} registered with id ${storedDefinition.id}.`))
    if (storedDefinition.source.type === 'directory') {
      this.log(chalk.gray(`Stored at ${path.join(config.templatesDir!, storedDefinition.source.path)}`))
    }
  }

  private parseVariableAssignments(assignments?: string[]): Record<string, string> {
    const result: Record<string, string> = {}
    if (!assignments) return result
    for (const assignment of assignments) {
      const idx = assignment.indexOf('=')
      if (idx === -1) {
        throw new Error(`Invalid variable assignment: ${assignment}. Use key=value format.`)
      }
      const key = assignment.slice(0, idx).trim()
      const value = assignment.slice(idx + 1)
      if (!key) {
        throw new Error(`Invalid variable assignment: ${assignment}. Key is missing.`)
      }
      result[key] = value
    }
    return result
  }

  private async loadVariableFile(filePath: string): Promise<Record<string, string>> {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      const parsed = JSON.parse(content)
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        throw new Error('Variables file must contain a JSON object of key/value pairs')
      }
      const record: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed)) {
        record[key] = String(value)
      }
      return record
    } catch (error) {
      throw new Error(`Failed to read variables file ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async resolveTargetDirectory(dirFlag?: string): Promise<string> {
    if (dirFlag) {
      return path.resolve(dirFlag.replace('~', os.homedir()))
    }
    return await promptForTargetDirectory()
  }
}
