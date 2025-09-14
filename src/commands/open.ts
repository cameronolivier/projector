import { Command, Flags } from '@oclif/core'
import { ConfigurationManager } from '../lib/config/config.js'
import { ProjectScanner } from '../lib/discovery/scanner.js'
import { TypeDetector } from '../lib/discovery/detector.js'
import { TrackingAnalyzer } from '../lib/tracking/analyzer.js'
import { CacheManager } from '../lib/cache/manager.js'
import inquirer from 'inquirer'
import { defaultEditorFromEnv, supportedEditors, buildEditorCommand, isGuiEditor, type EditorId } from '../lib/commands/open-utils.js'
import { filterByName } from '../lib/commands/jump-utils.js'
import { spawn } from 'child_process'

export default class Open extends Command {
  static override description = 'Open a project in your editor (VS Code, WebStorm, etc.)'

  static override examples = [
    { description: 'Select a project and open in VS Code', command: '<%= config.bin %> open --select --editor code' },
    { description: 'Open first name match in WebStorm', command: '<%= config.bin %> open --name api --editor webstorm' },
    { description: 'Dry run: print the command only', command: '<%= config.bin %> open --select --dry-run' },
  ]

  static override flags = {
    directory: Flags.string({ char: 'd', description: 'Directory to scan (defaults to configured scan directory)', helpValue: '~/my-projects' }),
    depth: Flags.integer({ description: 'Maximum directory depth for recursive scanning. Default: 10', helpValue: '5' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed progress information during scanning' }),
    'no-cache': Flags.boolean({ description: 'Skip reading from cache and force fresh analysis', default: false }),
    'clear-cache': Flags.boolean({ description: 'Delete all cached analysis data before scanning', default: false }),
    select: Flags.boolean({ description: 'Interactively select a project (TTY only)', default: false }),
    name: Flags.string({ description: 'Case-insensitive substring to filter project name', helpValue: 'api' }),
    editor: Flags.string({ description: `Target editor (${supportedEditors().join(', ')})`, helpValue: 'code' }),
    wait: Flags.boolean({ description: 'Wait for editor to close (where supported)', default: false }),
    'editor-args': Flags.string({ description: 'Additional editor arguments (comma-separated)', helpValue: '--reuse-window' }),
    'dry-run': Flags.boolean({ description: 'Print the command that would be executed', default: false }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Open)

    try {
      const configManager = new ConfigurationManager()
      const config = await configManager.loadConfig()
      const scanDirectory = flags.directory || config.scanDirectory
      const maxDepth = flags.depth || config.maxDepth

      const scanner = new ProjectScanner(config)
      const detector = new TypeDetector()
      const analyzer = new TrackingAnalyzer(config.trackingPatterns)
      const cacheManager = new CacheManager()

      if (flags['clear-cache']) {
        this.log('🗑️  Clearing cache...')
        await cacheManager.clearCache()
      }

      const directories = await scanner.scanDirectory(scanDirectory, {
        maxDepth,
        ignorePatterns: config.ignorePatterns,
        followSymlinks: false,
      })

      if (directories.length === 0) {
        this.warn(`No projects found in ${scanDirectory}`)
        this.exit(2)
        return
      }

      const projects: any[] = []
      for (const directory of directories) {
        let cachedData: any = null
        if (!flags['no-cache']) cachedData = await cacheManager.getCachedProject(directory)

        if (cachedData) {
          projects.push({ ...directory, type: detector.detectProjectType(directory), languages: cachedData.languages, hasGit: cachedData.hasGit, status: cachedData.status, description: cachedData.description, trackingFiles: [], confidence: cachedData.status.confidence })
        } else {
          const projectType = detector.detectProjectType(directory)
          const languages = detector.detectLanguages(directory)
          const hasGit = detector.hasGitRepository(directory)
          const status = await analyzer.analyzeProject(directory)
          const trackingFiles = await analyzer.detectTrackingFiles(directory)
          let description = config.descriptions[directory.name] || 'No description available'
          for (const tf of trackingFiles) { if (tf.content.description) { description = tf.content.description; break } }
          if (!flags['no-cache']) await cacheManager.setCachedProject(directory, status, description, trackingFiles, languages, hasGit)
          projects.push({ ...directory, type: projectType, languages, hasGit, status, description, trackingFiles: [], confidence: status.confidence })
        }
      }

      projects.sort((a, b) => a.name.localeCompare(b.name))

      let filtered = filterByName(projects as any, flags.name) as any[]
      if (filtered.length === 0) {
        this.warn(`No project matched name pattern: ${flags.name ?? ''}`)
        this.exit(2)
        return
      }

      if (flags.select) {
        const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY)
        if (!isTTY) {
          this.warn('Non-interactive environment detected; use --name or run with a TTY')
          this.exit(2)
          return
        }

        try {
          const choices = filtered.map(p => ({ name: `${p.name} — ${p.status.type} (${p.type}) — ${p.path}`, value: p.path }))
          const answer = await inquirer.prompt<{ projectPath: string }>([{ type: 'list', name: 'projectPath', message: 'Select a project to open', choices, pageSize: 15 }])
          await this.openInEditor(answer.projectPath, flags)
          return
        } catch {
          this.warn('Selection cancelled')
          this.exit(130)
          return
        }
      }

      const target = filtered[0]
      await this.openInEditor(target.path, flags)
    } catch (error) {
      this.error(`Failed to open project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async openInEditor(projectPath: string, flags: any) {
    const editorId = (flags.editor as EditorId) || defaultEditorFromEnv(process.env)
    if (!supportedEditors().includes(editorId)) {
      this.error(`Unsupported editor: ${editorId}. Supported: ${supportedEditors().join(', ')}`)
      return
    }

    const editorArgs = typeof flags['editor-args'] === 'string' && flags['editor-args'].length > 0
      ? (flags['editor-args'] as string).split(',').map((s: string) => s.trim()).filter(Boolean)
      : []

    const { cmd, args } = buildEditorCommand(editorId, projectPath, { wait: Boolean(flags.wait), editorArgs })

    if (flags['dry-run']) {
      this.log([cmd, ...args].join(' '))
      return
    }

    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      detached: isGuiEditor(editorId),
    })

    child.on('error', (err) => {
      this.error(`Failed to launch editor: ${err instanceof Error ? err.message : String(err)}`)
    })

    if (Boolean(flags.wait) && isGuiEditor(editorId)) {
      await new Promise<void>((resolve, reject) => {
        child.on('exit', () => resolve())
        child.on('close', () => resolve())
        child.on('error', (e) => reject(e))
      })
    }
  }
}
