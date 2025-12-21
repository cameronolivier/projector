import { Command, Flags } from '@oclif/core'
import * as path from 'path'
import * as os from 'os'
import { ProjectScanner } from '../lib/discovery/scanner.js'
import { TypeDetector } from '../lib/discovery/detector.js'
import { TrackingAnalyzer } from '../lib/tracking/analyzer.js'
import { ConfigurationManager } from '../lib/config/config.js'
import { CacheManager } from '../lib/cache/manager.js'
import { Spinner } from '../lib/output/spinner.js'
import inquirer from 'inquirer'
import {
  generateIgnorePatterns,
  loadCurrentIgnoreState,
  mergeIgnorePatterns,
  type PatternResult,
} from '../lib/commands/ignore-utils.js'
import type { AnalyzedProject } from '../lib/types.js'
import chalk from 'chalk'

export default class Ignore extends Command {
  static override description = 'Interactively manage project ignore patterns with checkbox selection'

  static override examples = [
    {
      description: 'Launch interactive ignore manager',
      command: '<%= config.bin %> ignore',
    },
    {
      description: 'Preview changes without saving',
      command: '<%= config.bin %> ignore --dry-run',
    },
    {
      description: 'Scan specific directory with verbose output',
      command: '<%= config.bin %> ignore --directory ~/projects --verbose',
    },
    {
      description: 'Clear cache before scanning',
      command: '<%= config.bin %> ignore --clear-cache',
    },
  ]

  static override flags = {
    directory: Flags.string({
      char: 'd',
      description: 'Directory to scan for projects',
      helpValue: '~/projects',
    }),
    depth: Flags.integer({
      description: 'Maximum scan depth',
      helpValue: '5',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed information during pattern generation',
    }),
    'dry-run': Flags.boolean({
      description: 'Preview changes without saving to config',
      default: false,
    }),
    'clear-cache': Flags.boolean({
      description: 'Clear cache before scanning',
      default: false,
    }),
    'no-cache': Flags.boolean({
      description: 'Skip cache during scan',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Ignore)

    try {
      // Load configuration
      const configManager = new ConfigurationManager()
      const config = await configManager.loadConfig()

      // Handle cache clearing
      if (flags['clear-cache']) {
        const cacheManager = new CacheManager()
        await cacheManager.clearCache()
        if (flags.verbose) {
          this.log(chalk.gray('✓ Cache cleared'))
        }
      }

      // Step 1: Scan projects
      const spinner = new Spinner('🔍 Scanning projects...')
      spinner.start()

      const scanDirectory = flags.directory || config.scanDirectory
      const maxDepth = flags.depth !== undefined ? flags.depth : config.maxDepth

      const scanner = new ProjectScanner(config)
      const detector = new TypeDetector()
      const analyzer = new TrackingAnalyzer(config.trackingPatterns)

      let projects: AnalyzedProject[] = []

      try {
        const discoveredDirs = await scanner.scanDirectory(scanDirectory, {
          maxDepth,
          ignorePatterns: [], // Don't apply ignore patterns - we want to see all projects
          followSymlinks: false,
        })

        for (const dir of discoveredDirs) {
          const type = detector.detectProjectType(dir)
          const status = await analyzer.analyzeProject(dir)
          const trackingFiles = await analyzer.detectTrackingFiles(dir)
          const languages = detector.detectLanguages(dir)
          const hasGit = detector.hasGitRepository(dir)

          // Extract description from tracking files if available
          let description = config.descriptions?.[dir.name] || ''
          for (const trackingFile of trackingFiles) {
            if (trackingFile.content.description) {
              description = trackingFile.content.description
              break
            }
          }

          projects.push({
            ...dir,
            type,
            languages,
            hasGit,
            status,
            description,
            trackingFiles,
            confidence: status.confidence,
          })
        }

        // Handle no projects found
        if (projects.length === 0) {
          spinner.fail('No projects found')
          return
        }

        spinner.succeed(`Found ${projects.length} project${projects.length === 1 ? '' : 's'}`)
      } catch (error) {
        spinner.fail('Failed to scan projects')
        throw error
      }

      // Step 2: Load current ignore state
      const currentIgnoreState = loadCurrentIgnoreState(projects, config)
      const currentlyIgnoredProjects = projects.filter((p) => currentIgnoreState.get(p.path))

      if (flags.verbose) {
        this.log(chalk.gray(`  ${currentlyIgnoredProjects.length} currently ignored`))
      }

      // Step 3: Show checkbox prompt
      const choices = projects.map((p) => {
        const isIgnored = currentIgnoreState.get(p.path) || false
        const icon = isIgnored ? '🚫' : '  '
        const statusColor = this.getStatusColor(p.status.type)
        const typeLabel = chalk.gray(`(${p.type.toLowerCase()})`)

        return {
          name: `${icon} ${p.name} ${chalk.dim('—')} ${statusColor(p.status.type)} ${typeLabel} ${chalk.dim('—')} ${chalk.gray(p.path)}`,
          value: p.path,
          checked: isIgnored,
        }
      })

      const { selectedPaths } = await inquirer.prompt<{ selectedPaths: string[] }>([
        {
          type: 'checkbox',
          name: 'selectedPaths',
          message: 'Select projects to ignore (Space to toggle, Enter to confirm)',
          choices,
          pageSize: 20,
          loop: false,
        },
      ])

      // Step 4: Detect changes
      const selectedSet = new Set(selectedPaths)
      const currentlyIgnoredSet = new Set(currentlyIgnoredProjects.map((p) => p.path))

      const projectsToIgnore = projects.filter((p) => selectedSet.has(p.path) && !currentlyIgnoredSet.has(p.path))
      const projectsToUnignore = projects.filter((p) => !selectedSet.has(p.path) && currentlyIgnoredSet.has(p.path))

      // No changes made
      if (projectsToIgnore.length === 0 && projectsToUnignore.length === 0) {
        this.log(chalk.gray('ℹ️  No changes made'))
        return
      }

      if (flags.verbose) {
        if (projectsToIgnore.length > 0) {
          this.log(chalk.yellow(`  Will ignore: ${projectsToIgnore.map((p) => p.name).join(', ')}`))
        }
        if (projectsToUnignore.length > 0) {
          this.log(chalk.green(`  Will unignore: ${projectsToUnignore.map((p) => p.name).join(', ')}`))
        }
      }

      // Step 5: Choose pattern generation mode
      const { actionChoice } = await inquirer.prompt<{ actionChoice: string }>([
        {
          type: 'list',
          name: 'actionChoice',
          message: 'Choose how to save patterns',
          choices: [
            { name: 'Save as smart patterns (recommended)', value: 'smart' },
            { name: 'Save exact project names', value: 'exact' },
            { name: 'Review patterns before saving', value: 'review' },
            { name: 'Cancel (no changes)', value: 'cancel' },
          ],
        },
      ])

      if (actionChoice === 'cancel') {
        this.log(chalk.gray('ℹ️  Cancelled'))
        return
      }

      // Step 6: Generate smart patterns
      const generationMode = actionChoice === 'exact' ? 'exact' : 'smart'

      if (flags.verbose && projectsToIgnore.length > 0) {
        this.log(chalk.gray('🧠 Generating patterns...'))
      }

      const newPatternResults = projectsToIgnore.length > 0
        ? generateIgnorePatterns(projectsToIgnore, projects, {
            mode: generationMode,
            verbose: flags.verbose,
          })
        : []

      // Merge with existing patterns
      const mergedPatterns = mergeIgnorePatterns(
        config.ignore?.patterns || [],
        newPatternResults,
        projectsToUnignore,
        projects
      )

      // Step 7: Show summary
      this.showPatternSummary(newPatternResults, projectsToUnignore, mergedPatterns)

      // Step 8: Review mode - show patterns and confirm
      if (actionChoice === 'review') {
        const { confirmReview } = await inquirer.prompt<{ confirmReview: boolean }>([
          {
            type: 'confirm',
            name: 'confirmReview',
            message: 'Save these patterns to config?',
            default: true,
          },
        ])

        if (!confirmReview) {
          this.log(chalk.gray('ℹ️  Cancelled'))
          return
        }
      }

      // Step 9: Dry-run mode - stop before saving
      if (flags['dry-run']) {
        this.log(chalk.yellow('\n🔍 Dry-run mode: No changes saved'))
        return
      }

      // Step 10: Save to config
      const updatedConfig = { ...config }
      if (!updatedConfig.ignore) {
        updatedConfig.ignore = {
          patterns: [],
          useIgnoreFiles: true,
          ignoreFileName: '.projectorignore',
          directories: [],
        }
      }
      updatedConfig.ignore.patterns = mergedPatterns

      await configManager.saveConfig(updatedConfig)

      // Step 11: Success message
      this.log(chalk.green(`\n✅ Saved ${mergedPatterns.length} ignore pattern${mergedPatterns.length === 1 ? '' : 's'} to config`))
      const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
      const configPath = path.join(configHome, 'projector', 'config.yaml')
      this.log(chalk.gray(`📁 Config: ${configPath}`))
    } catch (error) {
      if ((error as any).isTtyError) {
        this.error('Prompt could not be rendered in this environment')
      } else if ((error as any).name === 'ExitPromptError') {
        // User cancelled with Ctrl+C
        this.exit(130)
      } else {
        throw error
      }
    }
  }

  private getStatusColor(status: string): (text: string) => string {
    switch (status) {
      case 'stable':
        return chalk.green
      case 'active':
      case 'phase':
        return chalk.blue
      case 'archived':
        return chalk.gray
      default:
        return chalk.yellow
    }
  }

  private showPatternSummary(
    newPatternResults: PatternResult[],
    projectsToUnignore: AnalyzedProject[],
    finalPatterns: string[]
  ): void {
    this.log(chalk.bold('\n📝 Pattern Summary'))
    this.log(chalk.gray('─'.repeat(50)))

    if (newPatternResults.length > 0) {
      const totalMatches = newPatternResults.reduce((sum, r) => sum + r.matches.length, 0)
      this.log(chalk.white(`Will ignore ${totalMatches} project${totalMatches === 1 ? '' : 's'} using ${newPatternResults.length} pattern${newPatternResults.length === 1 ? '' : 's'}:`))
      this.log('')

      for (const result of newPatternResults) {
        const typeLabel = chalk.gray(`[${result.type}]`)
        this.log(chalk.cyan(`  Pattern: ${result.pattern}`) + ` ${typeLabel}`)
        this.log(chalk.gray(`    Matches: ${result.matches.join(', ')}`))
        this.log('')
      }
    }

    if (projectsToUnignore.length > 0) {
      this.log(chalk.white(`Will unignore ${projectsToUnignore.length} project${projectsToUnignore.length === 1 ? '' : 's'}:`))
      this.log(chalk.gray(`  ${projectsToUnignore.map((p) => p.name).join(', ')}`))
      this.log('')
    }

    this.log(chalk.white(`Final ignore patterns (${finalPatterns.length}):`))
    if (finalPatterns.length > 0) {
      for (const pattern of finalPatterns) {
        this.log(chalk.gray(`  - ${pattern}`))
      }
    } else {
      this.log(chalk.gray('  (none)'))
    }

    this.log(chalk.gray('─'.repeat(50)))
  }
}
