import { Command, Flags } from '@oclif/core'
import { ConfigurationManager } from '../lib/config/config.js'
import inquirer from 'inquirer'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs/promises'
import chalk from 'chalk'
import { detectShell, findRcCandidates, getWrapperForShell, installWrapperInto, shortenHome, fileExists as fileExistsFs } from '../lib/shell/wrapper.js'

export default class Init extends Command {
  static override description = 'Initialize projector configuration with an interactive setup wizard'

  static override examples = [
    {
      description: 'Run the interactive setup wizard',
      command: '<%= config.bin %> init',
    },
    {
      description: 'Run setup wizard and force overwrite existing config',
      command: '<%= config.bin %> init --force',
    },
  ]

  static override flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Force overwrite existing configuration file if it exists',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Init)
    const configManager = new ConfigurationManager()

    this.log(chalk.cyan('🚀 Welcome to Projector Setup Wizard!\n'))
    this.log('This wizard will help you configure projector for your development environment.\n')

    // Check if config already exists
    const configPath = this.getConfigPath()
    const configExists = await this.fileExists(configPath)

    if (configExists && !flags.force) {
      const { overwrite } = await inquirer.prompt({
        type: 'confirm',
        name: 'overwrite',
        message: 'Configuration file already exists. Do you want to overwrite it?',
        default: false,
      })

      if (!overwrite) {
        this.log(chalk.yellow('Setup cancelled. Use --force flag to overwrite existing config.'))
        return
      }
    }

    try {
      // Get current defaults
      const defaults = configManager.getDefaultConfig()
      
      // Run the setup wizard
      const config = await this.runSetupWizard(defaults)
      
      // Save the configuration
      await configManager.saveConfig(config)
      
      // Success message
      this.log(chalk.green('\n✅ Configuration saved successfully!'))
      this.log(chalk.cyan(`📁 Config location: ${configPath}`))

      // Offer to install the projector shell wrapper for cd-in-place
      await this.maybeInstallShellWrapper()

      this.log('\n' + chalk.yellow('Next steps:'))
      this.log('• Run ' + chalk.cyan('projector') + ' to scan your projects')
      this.log('• Use ' + chalk.cyan('projector cache') + ' to manage cache')
      this.log('• Edit ' + chalk.cyan(configPath) + ' to fine-tune settings')
      this.log('• See ' + chalk.cyan('docs/config.md') + ' for all configuration options')
      
    } catch (error) {
      this.error(`Failed to initialize configuration: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async maybeInstallShellWrapper() {
    this.log('\n' + chalk.blue('🧩 Shell Integration'))
    this.log('=====================================')
    this.log('Install a shell wrapper so choosing "Change directory" updates your current shell.')

    const { install } = await inquirer.prompt<{ install: boolean }>([
      {
        type: 'confirm',
        name: 'install',
        message: 'Would you like to add the projector shell function to your shell rc file now?',
        default: true,
      },
    ])

    if (!install) return

    const shellName = detectShell()
    const candidates = await findRcCandidates(shellName)

    if (candidates.length === 0) {
      this.log(chalk.yellow('Could not find a shell rc file automatically.'))
      const { targetPath } = await inquirer.prompt<{ targetPath: string }>([
        {
          type: 'input',
          name: 'targetPath',
          message: 'Enter the full path to your shell rc file (e.g., ~/.zshrc or ~/.bashrc):',
          filter: (v: string) => v.replace('~', os.homedir()),
        },
      ])
      await this.installWrapperInto(targetPath, shellName)
      return
    }

    let target: string
    if (candidates.length === 1) {
      target = candidates[0]
      this.log(`Found shell rc file: ${chalk.cyan(shortenHome(target))}`)
    } else {
      const { selected } = await inquirer.prompt<{ selected: string }>([
        {
          type: 'list',
          name: 'selected',
          message: 'Multiple rc files found. Choose where to add the projector function:',
          choices: [
            ...candidates.map((p) => ({ name: shortenHome(p), value: p })),
            { name: 'Other (enter a path)', value: '__OTHER__' },
          ],
        },
      ])
      if (selected === '__OTHER__') {
        const { targetPath } = await inquirer.prompt<{ targetPath: string }>([
          {
            type: 'input',
            name: 'targetPath',
            message: 'Enter the full path to your shell rc file:',
            filter: (v: string) => v.replace('~', os.homedir()),
          },
        ])
        target = targetPath
      } else {
        target = selected
      }
    }

    await this.installWrapperInto(target, shellName)
  }

  private async installWrapperInto(rcPath: string, shell: 'zsh' | 'bash' | 'fish' | 'powershell' | 'unknown') {
    const exists = await fileExistsFs(rcPath)
    if (!exists) {
      this.error(`Shell rc file not found: ${rcPath}`)
      return
    }

    const cfg = await new ConfigurationManager().loadConfig()
    const wrapper = getWrapperForShell(shell, cfg.cdSentinel || '__PROJECTOR_CD__')
    if (!wrapper) {
      this.warn('Unknown shell type; writing bash/zsh-compatible wrapper by default.')
    }
    const contentToAdd = (wrapper || getWrapperForShell('zsh', cfg.cdSentinel || '__PROJECTOR_CD__')!)

    const result = await installWrapperInto(rcPath, contentToAdd)
    this.log(chalk.gray(`Backup created: ${shortenHome(result.backupPath)}`))
    this.log(chalk.green(`Installed projector wrapper in ${shortenHome(result.rcPath)}`))
    this.postInstallMessage(shell, rcPath)
  }

  private postInstallMessage(shell: 'zsh' | 'bash' | 'fish' | 'powershell' | 'unknown', rcPath: string) {
    this.log('\n' + chalk.yellow('To apply changes:'))
    if (shell === 'fish') {
      this.log(`• Run ${chalk.cyan('source ' + shortenHome(rcPath))} or open a new terminal tab`)
    } else {
      this.log(`• Run ${chalk.cyan('source ' + shortenHome(rcPath))} or open a new terminal tab`)
    }
    this.log('Then run ' + chalk.cyan('projector') + ' and choose “Change directory” to test it.')
  }

  private async runSetupWizard(defaults: any) {
    this.log(chalk.blue('📂 Scanning Configuration'))
    this.log('=====================================\n')

    // 1. Scan Directory
    const { scanDirectory } = await inquirer.prompt({
      type: 'input',
      name: 'scanDirectory',
      message: 'Where should projector scan for your development projects?',
      default: defaults.scanDirectory,
      validate: async (input: string) => {
        const expandedPath = input.replace('~', os.homedir())
        try {
          const stats = await fs.stat(expandedPath)
          if (!stats.isDirectory()) {
            return 'Please provide a valid directory path'
          }
          return true
        } catch {
          return `Directory "${expandedPath}" does not exist. Please provide a valid path.`
        }
      },
      filter: (input: string) => input.replace('~', os.homedir()),
    })

    // 2. Max Depth
    const { maxDepth } = await inquirer.prompt({
      type: 'number',
      name: 'maxDepth',
      message: 'Maximum directory depth to scan? (higher = finds nested projects, slower)',
      default: defaults.maxDepth,
      validate: (input: number | undefined) => {
        if (input === undefined || input < 1 || input > 20) {
          return 'Please enter a depth between 1 and 20'
        }
        return true
      },
    })

    // 3. Additional ignore patterns
    this.log(chalk.blue('\n🚫 Ignore Patterns'))
    this.log('=====================================')
    this.log('Default patterns to ignore: ' + chalk.gray(defaults.ignorePatterns.slice(0, 5).join(', ') + '...'))
    
    const { customIgnorePatterns, additionalIgnores } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'customIgnorePatterns',
        message: 'Do you want to add custom directories/patterns to ignore?',
        default: false,
      },
      {
        type: 'input',
        name: 'additionalIgnores',
        message: 'Enter additional ignore patterns (comma-separated):',
        when: (answers) => answers.customIgnorePatterns,
        filter: (input: string) => input.split(',').map(s => s.trim()).filter(s => s.length > 0),
      },
    ])

    // 4. Color scheme preference
    this.log(chalk.blue('\n🎨 Color Scheme'))
    this.log('=====================================')
    
    const { useCustomColors, colorScheme } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useCustomColors',
        message: 'Do you want to customize the color scheme?',
        default: false,
      },
      {
        type: 'list',
        name: 'colorScheme',
        message: 'Choose a color theme:',
        when: (answers) => answers.useCustomColors,
        choices: [
          { name: 'Default (cyan/orange/green)', value: 'default' },
          { name: 'Monochrome (black/white/gray)', value: 'monochrome' },
          { name: 'Warm (orange/red/yellow)', value: 'warm' },
          { name: 'Cool (blue/cyan/purple)', value: 'cool' },
        ],
        default: 'default',
      },
    ])

    // 5. Project descriptions
    this.log(chalk.blue('\n📝 Project Descriptions'))
    this.log('=====================================')
    
    const { addDescriptions, projectDescriptions } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addDescriptions',
        message: 'Do you want to add custom descriptions for specific projects?',
        default: false,
      },
      {
        type: 'editor',
        name: 'projectDescriptions',
        message: 'Enter project descriptions (format: project-name: description)',
        when: (answers) => answers.addDescriptions,
        default: 'my-project: My awesome project\nanother-project: Another great project',
      },
    ])

    // Build final configuration
    const finalIgnorePatterns = [...defaults.ignorePatterns]
    if (additionalIgnores && additionalIgnores.length > 0) {
      finalIgnorePatterns.push(...additionalIgnores)
    }

    let finalColorScheme = defaults.colorScheme
    if (useCustomColors && colorScheme) {
      finalColorScheme = this.getColorScheme(colorScheme)
    }

    let finalDescriptions = { ...defaults.descriptions }
    if (addDescriptions && projectDescriptions) {
      const customDescriptions = this.parseDescriptions(projectDescriptions)
      finalDescriptions = { ...defaults.descriptions, ...customDescriptions }
    }

    return {
      scanDirectory,
      maxDepth,
      trackingPatterns: defaults.trackingPatterns,
      descriptions: finalDescriptions,
      ignorePatterns: finalIgnorePatterns,
      codeFileExtensions: defaults.codeFileExtensions,
      colorScheme: finalColorScheme,
    }
  }

  private getColorScheme(scheme: string) {
    const schemes = {
      default: {
        header: '#00d4ff',
        phaseStatus: '#ff6b35',
        stableStatus: '#4caf50',
        unknownStatus: '#9e9e9e',
        projectName: '#ffffff',
      },
      monochrome: {
        header: '#ffffff',
        phaseStatus: '#cccccc',
        stableStatus: '#888888',
        unknownStatus: '#666666',
        projectName: '#ffffff',
      },
      warm: {
        header: '#ff9500',
        phaseStatus: '#ff6b35',
        stableStatus: '#ffcc00',
        unknownStatus: '#cc9966',
        projectName: '#ffffff',
      },
      cool: {
        header: '#0099ff',
        phaseStatus: '#6666ff',
        stableStatus: '#00cc99',
        unknownStatus: '#7788aa',
        projectName: '#ffffff',
      },
    }

    return schemes[scheme as keyof typeof schemes] || schemes.default
  }

  private parseDescriptions(input: string): Record<string, string> {
    const descriptions: Record<string, string> = {}
    
    const lines = input.split('\n').filter(line => line.trim() && line.includes(':'))
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':')
      const value = valueParts.join(':').trim()
      if (key.trim() && value) {
        descriptions[key.trim()] = value
      }
    }
    
    return descriptions
  }

  private getConfigPath(): string {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configHome, 'projector', 'config.yaml')
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
