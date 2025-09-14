import { Command, Flags } from '@oclif/core'
import { ConfigurationManager } from '../lib/config/config.js'
import { ProjectScanner } from '../lib/discovery/scanner.js'
import { TypeDetector } from '../lib/discovery/detector.js'
import { TrackingAnalyzer } from '../lib/tracking/analyzer.js'
import { CacheManager } from '../lib/cache/manager.js'
import inquirer from 'inquirer'
import { filterByName, formatOutputPath } from '../lib/commands/jump-utils.js'

export default class Jump extends Command {
  static override description = 'Resolve and print a project directory for quick cd integration'

  static override examples = [
    {
      description: 'Interactively select a project and print its path',
      command: '<%= config.bin %> jump --select',
    },
    {
      description: 'Jump to the first project whose name includes "api"',
      command: '<%= config.bin %> jump --name api',
    },
    {
      description: 'Emit a shell-ready cd command for eval/source',
      command: '<%= config.bin %> jump --select --print-cd',
    },
  ]

  static override flags = {
    directory: Flags.string({
      char: 'd',
      description: 'Directory to recursively scan for development projects. Defaults to configured scan directory (~/dev)',
      helpValue: '~/my-projects',
    }),
    depth: Flags.integer({
      description: 'Maximum directory depth for recursive scanning. Default: 10',
      helpValue: '5',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed progress information during scanning',
    }),
    'no-cache': Flags.boolean({
      description: 'Skip reading from cache and force fresh analysis of all projects',
      default: false,
    }),
    'clear-cache': Flags.boolean({
      description: 'Delete all cached analysis data before scanning',
      default: false,
    }),
    select: Flags.boolean({
      description: 'Interactively select a project (TTY only)',
      default: false,
    }),
    name: Flags.string({
      description: 'Case-insensitive substring to filter project name',
      helpValue: 'api',
    }),
    'print-cd': Flags.boolean({
      description: 'Print a shell-ready command: cd "<path>"',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Jump)

    try {
      // Load configuration
      const configManager = new ConfigurationManager()
      const config = await configManager.loadConfig()

      // Override with command line flags
      const scanDirectory = flags.directory || config.scanDirectory
      const maxDepth = flags.depth || config.maxDepth

      if (flags.verbose) {
        this.log(`Scanning for projects in ${scanDirectory} (depth=${maxDepth})`)
      }

      // Initialize components
      const scanner = new ProjectScanner(config)
      const detector = new TypeDetector()
      const analyzer = new TrackingAnalyzer(config.trackingPatterns)
      const cacheManager = new CacheManager()

      // Handle cache clearing
      if (flags['clear-cache']) {
        this.log('🗑️  Clearing cache...')
        await cacheManager.clearCache()
      }

      // Discover projects
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

      // Analyze each project (reuse caching similar to list command)
      const projects = [] as Array<ReturnType<typeof mapProject> extends infer T ? T : never>

      function mapProject(directory: any, detectedType: any, languages: string[], hasGit: boolean, status: any, description: string) {
        return {
          ...directory,
          type: detectedType,
          languages,
          hasGit,
          status,
          description,
          trackingFiles: [],
          confidence: status.confidence,
        }
      }

      for (const directory of directories) {
        let cachedData = null as any
        if (!flags['no-cache']) {
          cachedData = await cacheManager.getCachedProject(directory)
        }

        if (cachedData) {
          const detectedType = detector.detectProjectType(directory)
          projects.push(
            mapProject(
              directory,
              detectedType,
              cachedData.languages,
              cachedData.hasGit,
              cachedData.status,
              cachedData.description,
            ),
          )
        } else {
          const detectedType = detector.detectProjectType(directory)
          const languages = detector.detectLanguages(directory)
          const hasGit = detector.hasGitRepository(directory)

          const status = await analyzer.analyzeProject(directory)
          const trackingFiles = await analyzer.detectTrackingFiles(directory)

          let description = config.descriptions[directory.name] || 'No description available'
          for (const trackingFile of trackingFiles) {
            if (trackingFile.content.description) {
              description = trackingFile.content.description
              break
            }
          }

          if (!flags['no-cache']) {
            await cacheManager.setCachedProject(
              directory,
              status,
              description,
              trackingFiles,
              languages,
              hasGit,
            )
          }

          projects.push(
            mapProject(directory, detectedType, languages, hasGit, status, description),
          )
        }
      }

      // Sort projects by name
      projects.sort((a: any, b: any) => a.name.localeCompare(b.name))

      // Optional name filter (case-insensitive substring)
      let filtered = filterByName(projects as any, flags.name) as any[]
      if (filtered.length === 0) {
        this.warn(`No project matched name pattern: ${flags.name ?? ''}`)
        this.exit(2)
        return
      }

      // Interactive selection flow
      if (flags.select) {
        const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY)
        if (!isTTY) {
          this.warn('Non-interactive environment detected; use --name or run with a TTY')
          this.exit(2)
          return
        }

        try {
          const choices = filtered.map(p => ({
            name: `${p.name} — ${p.status.type} (${p.type}) — ${p.path}`,
            value: p.path,
          }))

          const answer = await inquirer.prompt<{ projectPath: string }>([
            {
              type: 'list',
              name: 'projectPath',
              message: 'Select a project to jump to',
              choices,
              pageSize: 15,
            },
          ])

          this.log(formatOutputPath(answer.projectPath, Boolean(flags['print-cd'])))
          return
        } catch {
          this.warn('Selection cancelled')
          this.exit(130)
          return
        }
      }

      // Non-interactive resolution: pick first filtered
      const target = filtered[0]
      if (!target) {
        this.warn('No project available to jump to')
        this.exit(2)
        return
      }

      if (flags.name && filtered.length > 1) {
        this.warn(
          `Multiple matches for "${flags.name}"; using first match "${target.name}". Consider --select.`,
        )
      }

      this.log(formatOutputPath(target.path, Boolean(flags['print-cd'])))
    } catch (error) {
      this.error(`Failed to resolve project: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

}
