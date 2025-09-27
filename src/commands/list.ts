import { Command, Flags } from '@oclif/core'
import { ProjectScanner } from '../lib/discovery/scanner.js'
import { TypeDetector } from '../lib/discovery/detector.js'
import { TrackingAnalyzer } from '../lib/tracking/analyzer.js'
import { TableGenerator } from '../lib/output/table.js'
import { ConfigurationManager } from '../lib/config/config.js'
import { CacheManager } from '../lib/cache/manager.js'
import inquirer from 'inquirer'
import { defaultEditorFromEnv, supportedEditors, buildEditorCommand, isGuiEditor, type EditorId } from '../lib/commands/open-utils.js'
import { spawn } from 'child_process'
import { GitAnalyzer } from '../lib/git/analyzer.js'
import type { CachedGitInsights } from '../lib/types.js'

export default class List extends Command {
  static override description = 'Discover and analyze development projects with intelligent scanning and status tracking'

  static override examples = [
    {
      description: 'Scan default directory with default settings',
      command: '<%= config.bin %>',
    },
    {
      description: 'Scan with increased depth for nested projects',
      command: '<%= config.bin %> --depth 5',
    },
    {
      description: 'Scan a specific directory',
      command: '<%= config.bin %> --directory ~/my-projects',
    },
    {
      description: 'Force fresh analysis without using cache',
      command: '<%= config.bin %> --no-cache',
    },
    {
      description: 'Clear cache and rescan with verbose output',
      command: '<%= config.bin %> --clear-cache --verbose',
    },
    {
      description: 'Scan deeply nested monorepo structures',
      command: '<%= config.bin %> --directory ~/work --depth 8 --verbose',
    },
  ]

  static override flags = {
    directory: Flags.string({
      char: 'd',
      description: 'Directory to recursively scan for development projects. Defaults to configured scan directory (~/dev)',
      helpValue: '~/my-projects',
    }),
    depth: Flags.integer({
      description: 'Maximum directory depth for recursive scanning. Higher values find more nested projects but take longer. Default: 10',
      helpValue: '5',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed progress information, cache statistics, and analysis details during scanning',
    }),
    'no-cache': Flags.boolean({
      description: 'Skip reading from cache and force fresh analysis of all projects. Useful when project files have changed',
      default: false,
    }),
    'clear-cache': Flags.boolean({
      description: 'Delete all cached analysis data before scanning. Combines with fresh analysis for complete rebuild',
      default: false,
    }),
    select: Flags.boolean({
      description: 'Interactively select a project from the results after scanning',
      default: false,
    }),
    'path-only': Flags.boolean({
      description: 'When used with --select, print only the selected project path (no table or extra output)',
      default: false,
    }),
    format: Flags.string({
      description: 'Format for selection output when using --select',
      options: ['text', 'json'],
      default: 'text',
    }),
    interactive: Flags.boolean({
      description: 'Force interactive action flow (table → select project → choose action)',
      default: undefined,
    }),
    'no-interactive': Flags.boolean({
      description: 'Disable interactive prompts even in a TTY',
      default: false,
    }),
    'git-insights': Flags.boolean({
      description: 'Enable git insight collection for this run (use --no-git-insights to disable)',
      allowNo: true,
      default: undefined,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(List)
    
    try {
      // Load configuration
      const configManager = new ConfigurationManager()
      const config = await configManager.loadConfig()
      
      // Debug: show config being loaded
      if (flags.verbose) {
        this.log(`Config loaded: scanDirectory=${config.scanDirectory}, maxDepth=${config.maxDepth}`)
        this.log(`Flags: directory=${flags.directory}, depth=${flags.depth}`)
      }
      
      // Override with command line flags
      const scanDirectory = flags.directory || config.scanDirectory
      const maxDepth = flags.depth || config.maxDepth
      
      this.log(`🔍 Scanning projects in ${scanDirectory}...`)
      
      // Initialize components
      const scanner = new ProjectScanner(config)
      const detector = new TypeDetector()
      const analyzer = new TrackingAnalyzer(config.trackingPatterns)
      const tableGenerator = new TableGenerator()
      const cacheManager = new CacheManager()
      const gitAnalyzer = new GitAnalyzer()
      const gitConfig = config.gitInsights
      let gitInsightsEnabled = Boolean(gitConfig?.enabled)
      if (typeof flags['git-insights'] === 'boolean') {
        gitInsightsEnabled = flags['git-insights']
      }
      
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
        this.log(`No projects found in ${scanDirectory}`)
        return
      }
      
      // Analyze each project with caching
      const projects = []
      const totalCount = directories.length
      let processedCount = 0
      
      for (const directory of directories) {
        processedCount++
        const progress = `(${processedCount}/${totalCount})`
        
        // Try to get from cache first (unless disabled)
        let cachedData = null
        if (!flags['no-cache']) {
          cachedData = await cacheManager.getCachedProject(directory)
        }
        
        if (cachedData) {
          // Use cached data
          if (flags.verbose) {
            this.log(`📋 Using cached data for ${directory.name} ${progress}`)
          }

          let gitInsights = undefined
          if (gitInsightsEnabled && gitConfig && cachedData.hasGit) {
            try {
              const gitResult = await gitAnalyzer.collect(directory.path, gitConfig, cachedData.git)
              if (gitResult) {
                gitInsights = gitResult.insights
                if (!flags['no-cache'] && (!cachedData.git || gitResult.cache !== cachedData.git)) {
                  await cacheManager.updateGitInsights(directory, gitResult.cache)
                }
              } else if (cachedData.git?.insights) {
                gitInsights = cachedData.git.insights
              }
            } catch (error) {
              if (flags.verbose) {
                this.warn(`⚠️  Failed to collect git insights for ${directory.name}: ${error instanceof Error ? error.message : String(error)}`)
              }
              gitInsights = cachedData.git?.insights
            }
          }

          projects.push({
            ...directory,
            type: detector.detectProjectType(directory), // Detect type since we don't cache it
            languages: cachedData.languages,
            hasGit: cachedData.hasGit,
            status: cachedData.status,
            description: cachedData.description,
            trackingFiles: [],
            confidence: cachedData.status.confidence,
            git: gitInsights,
          })

        } else {
          // Fresh analysis
          if (flags.verbose || totalCount > 5) {
            this.log(`🔍 Analyzing ${directory.name} ${progress}`)
          }

          // Detect project type
          const projectType = detector.detectProjectType(directory)
          const languages = detector.detectLanguages(directory)
          const hasGit = detector.hasGitRepository(directory)

          // Analyze tracking status
          const status = await analyzer.analyzeProject(directory)
          const trackingFiles = await analyzer.detectTrackingFiles(directory)

          // Extract description from various sources
          let description = config.descriptions[directory.name] || 'No description available'

          // Try to get description from tracking files if available
          for (const trackingFile of trackingFiles) {
            if (trackingFile.content.description) {
              description = trackingFile.content.description
              break
            }
          }

          let gitCache: CachedGitInsights | undefined
          let gitInsights = undefined
          if (gitInsightsEnabled && gitConfig && hasGit) {
            try {
              const gitResult = await gitAnalyzer.collect(directory.path, gitConfig)
              if (gitResult) {
                gitCache = gitResult.cache
                gitInsights = gitResult.insights
              }
            } catch (error) {
              if (flags.verbose) {
                this.warn(`⚠️  Failed to collect git insights for ${directory.name}: ${error instanceof Error ? error.message : String(error)}`)
              }
            }
          }

          // Cache the results for next time
          if (!flags['no-cache']) {
            await cacheManager.setCachedProject(
              directory,
              status,
              description,
              trackingFiles,
              languages,
              hasGit,
              gitCache
            )
          }

          projects.push({
            ...directory,
            type: projectType,
            languages,
            hasGit,
            status,
            description,
            trackingFiles: [],
            confidence: status.confidence,
            git: gitInsights,
          })
        }
      }
      
      // Sort projects by name
      projects.sort((a, b) => a.name.localeCompare(b.name))

      // Generate table string
      const table = tableGenerator.generateTable(projects)

      // When selecting with --path-only, suppress table output
      const suppressOutput = Boolean(flags.select && flags['path-only'])
      if (!suppressOutput) {
        this.log(table)
      }

      // Display summary with cache stats unless suppressed
      const cacheStats = cacheManager.getStats()

      if (!suppressOutput) {
        this.log(`\n${tableGenerator.generateSummary(projects)}`)

        if (gitInsightsEnabled && flags.verbose) {
          const gitDetail = tableGenerator.generateGitDetails(projects)
          if (gitDetail) {
            this.log('')
            this.log(gitDetail)
          }
        }

        if (flags.verbose && cacheStats.totalProjects > 0) {
          this.log(`Cache: ${cacheStats.cacheHits} hits, ${cacheStats.cacheMisses} misses, ${cacheStats.invalidated} invalidated (${Math.round(cacheStats.cacheHitRate * 100)}% hit rate)`)
        }
      }

      // Optional interactive selection flow (legacy path)
      if (flags.select) {
        const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY)
        if (!isTTY) {
          this.warn('Non-interactive environment detected; --select ignored.')
          return
        }

        try {
          const choices = projects.map(p => ({
            name: `${p.name} — ${p.status.type} (${p.type}) — ${p.path}`,
            value: p.path,
          }))

          const answer = await inquirer.prompt<{ projectPath: string }>([
            {
              type: 'list',
              name: 'projectPath',
              message: 'Select a project',
              choices,
              pageSize: 15,
            },
          ])

          const selected = projects.find(p => p.path === answer.projectPath)
          if (!selected) {
            this.error('Selected project not found in results.')
            return
          }

          if (flags.format === 'json') {
            const payload = {
              name: selected.name,
              path: selected.path,
              type: selected.type,
              status: selected.status,
            }
            this.log(JSON.stringify(payload))
          } else {
            // text
            this.log(selected.path)
          }
        } catch (err) {
          // Handle cancellation (Ctrl+C) gracefully
          this.warn('Selection cancelled')
          this.exit(130)
        }
      }

      // New interactive action flow: table → pick project → choose action
      const isTTY = Boolean(process.stdout.isTTY && process.stdin.isTTY)
      const interactiveDefault = config.defaultInteractive ?? true
      const interactiveFlag = typeof flags.interactive === 'boolean' ? Boolean(flags.interactive) : undefined
      const interactiveEnabled = !flags['no-interactive'] && (interactiveFlag ?? (isTTY && interactiveDefault))

      if (interactiveEnabled) {
        if (!isTTY) {
          // Safety: only run when TTY
          return
        }

        try {
          const choices = projects.map(p => ({
            name: `${p.name} — ${p.status.type} (${p.type}) — ${p.path}`,
            value: p.path,
          }))
          const { projectPath } = await inquirer.prompt<{ projectPath: string }>([
            {
              type: 'list',
              name: 'projectPath',
              message: 'Select a project',
              choices,
              pageSize: 15,
            },
          ])

          const defaultEditor: EditorId = (config.defaultEditor as EditorId) || defaultEditorFromEnv(process.env)
          const actions = [
            { name: `Open in ${defaultEditor}`, value: 'open-default' },
            { name: 'Open in…', value: 'open-choose' },
            { name: 'Change directory', value: 'cd' },
            { name: 'Print path', value: 'print' },
          ]
          const { action } = await inquirer.prompt<{ action: string }>([
            {
              type: 'list',
              name: 'action',
              message: 'Choose action',
              choices: actions,
            },
          ])

          if (action === 'print') {
            this.log(projectPath)
            return
          }

          if (action === 'cd') {
            const sentinel = config.cdSentinel || '__PROJECTOR_CD__'
            this.log(`${sentinel} ${projectPath}`)
            this.exit(0)
          }

          let editorId: EditorId = defaultEditor
          if (action === 'open-choose') {
            const editors = supportedEditors()
            const { editor } = await inquirer.prompt<{ editor: EditorId }>([
              {
                type: 'list',
                name: 'editor',
                message: 'Select editor',
                choices: editors.map(e => ({ name: e, value: e })),
              },
            ])
            editorId = editor
          }

          // Build and spawn editor command
          const { cmd, args } = buildEditorCommand(editorId, projectPath, { wait: false, editorArgs: [] })
          const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: process.platform === 'win32',
            detached: isGuiEditor(editorId),
          })
          child.on('error', (err) => {
            this.warn(`Failed to launch editor: ${err instanceof Error ? err.message : String(err)}`)
          })
          // Do not wait; return to shell
          return
        } catch (err) {
          this.warn('Selection cancelled')
          this.exit(130)
        }
      }
      
    } catch (error) {
      this.error(`Failed to scan projects: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
