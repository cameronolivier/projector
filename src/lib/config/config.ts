import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { parse, stringify } from 'yaml'
import { ProjectsConfig, TrackingPattern, TrackingType, ColorScheme, TrackingInfo } from '../types.js'

export class ConfigurationManager {
  private configPath: string

  constructor() {
    this.configPath = this.getConfigPath()
  }

  async loadConfig(): Promise<ProjectsConfig> {
    try {
      await this.ensureConfigDirectory()
      
      const configExists = await this.fileExists(this.configPath)
      if (!configExists) {
        const defaultConfig = this.getDefaultConfig()
        await this.saveConfig(defaultConfig)
        return defaultConfig
      }

      const content = await fs.readFile(this.configPath, 'utf-8')
      const userConfig = parse(content) as Partial<ProjectsConfig>
      
      return this.mergeWithDefaults(userConfig)
    } catch (error) {
      console.warn(`Failed to load config, using defaults: ${error instanceof Error ? error.message : String(error)}`)
      return this.getDefaultConfig()
    }
  }

  async saveConfig(config: ProjectsConfig): Promise<void> {
    try {
      await this.ensureConfigDirectory()
      const yamlContent = stringify(config)
      await fs.writeFile(this.configPath, yamlContent, 'utf-8')
      
      // Set restrictive permissions on config file
      await fs.chmod(this.configPath, 0o600)
    } catch (error) {
      throw new Error(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  getDefaultConfig(): ProjectsConfig {
    return {
      scanDirectory: '/Users/cam/nona-mac/dev',
      maxDepth: 10,
      trackingPatterns: this.getDefaultTrackingPatterns(),
      descriptions: {
        'bb': 'Bitbucket CLI with GitHub parity',
        'serena': 'External dependency project',
        'projects': 'Development project management CLI tool',
      },
      ignorePatterns: [
        'node_modules',
        '.git',
        '.svn',
        '.hg',
        'dist',
        'build',
        'target',
        '__pycache__',
        '.pytest_cache',
        '.venv',
        'venv',
        '.env',
        'tmp',
        'temp',
        'logs',
        '.DS_Store',
        '.vscode',
        '.idea',
        'coverage',
        '.nyc_output',
        '.cache',
      ],
      codeFileExtensions: [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // TypeScript/JavaScript
        '.py', '.pyx', '.pyi',                         // Python
        '.php', '.phtml',                              // PHP
        '.go',                                         // Go
        '.rs',                                         // Rust
        '.java', '.kt', '.kts',                        // Java/Kotlin
        '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',     // C/C++
        '.cs',                                         // C#
        '.rb',                                         // Ruby
        '.swift',                                      // Swift
        '.dart',                                       // Dart
        '.vue',                                        // Vue
        '.svelte',                                     // Svelte
        '.html', '.htm',                               // HTML
        '.css', '.scss', '.sass', '.less',             // CSS
        '.sh', '.bash', '.zsh', '.fish',               // Shell scripts
        '.ps1', '.psm1',                               // PowerShell
        '.bat', '.cmd',                                // Windows batch
      ],
      colorScheme: {
        header: '#00d4ff',      // Bright cyan
        phaseStatus: '#ff6b35',  // Orange
        stableStatus: '#4caf50', // Green  
        unknownStatus: '#9e9e9e', // Gray
        projectName: '#ffffff',  // White
      },
    }
  }

  mergeWithDefaults(userConfig: Partial<ProjectsConfig>): ProjectsConfig {
    const defaults = this.getDefaultConfig()
    
    return {
      scanDirectory: userConfig.scanDirectory || defaults.scanDirectory,
      maxDepth: userConfig.maxDepth || defaults.maxDepth,
      trackingPatterns: userConfig.trackingPatterns || defaults.trackingPatterns,
      descriptions: { ...defaults.descriptions, ...userConfig.descriptions },
      ignorePatterns: userConfig.ignorePatterns || defaults.ignorePatterns,
      codeFileExtensions: userConfig.codeFileExtensions || defaults.codeFileExtensions,
      colorScheme: { ...defaults.colorScheme, ...userConfig.colorScheme },
    }
  }

  private getConfigPath(): string {
    // Follow XDG Base Directory Specification
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configHome, 'projects', 'config.yaml')
  }

  private async ensureConfigDirectory(): Promise<void> {
    const configDir = path.dirname(this.configPath)
    try {
      await fs.mkdir(configDir, { recursive: true })
    } catch (error) {
      // Directory might already exist
      if ((error as any).code !== 'EEXIST') {
        throw error
      }
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private getDefaultTrackingPatterns(): TrackingPattern[] {
    return [
      {
        pattern: 'CLAUDE.md',
        type: TrackingType.Claude,
      },
      {
        pattern: 'project_plan.md',
        type: TrackingType.ProjectPlan,
      },
      {
        pattern: 'epics.md',
        type: TrackingType.Epics,
      },
      {
        pattern: '*.todo',
        type: TrackingType.Todo,
      },
      {
        pattern: '*.plan',
        type: TrackingType.Custom,
      },
      {
        pattern: 'README.md',
        type: TrackingType.Custom,
      },
    ]
  }

  // Parser functions for different file types
  private parseClaudeFile = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    // Look for project phase information
    const phaseMatch = content.match(/(?:phase|Phase)\s*(\d+)(?:\s*\/\s*(\d+))?/i)
    if (phaseMatch) {
      info.phases = {
        current: parseInt(phaseMatch[1], 10),
        total: phaseMatch[2] ? parseInt(phaseMatch[2], 10) : 0,
      }
    }

    // Look for project overview/description
    const overviewMatch = content.match(/(?:core mission|problem statement)\s*:?\s*([^\n]+)/gi)
    if (overviewMatch && overviewMatch.length > 0) {
      info.description = overviewMatch[0].replace(/^[^:]+:\s*/, '').trim()
    }

    return info
  }

  private parseProjectPlan = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    // Count completed vs total tasks
    const totalTasks = (content.match(/^\s*-\s*\[[ x]\]/gm) || []).length
    const completedTasks = (content.match(/^\s*-\s*\[x\]/gm) || []).length
    
    if (totalTasks > 0) {
      info.phases = {
        current: completedTasks,
        total: totalTasks,
      }
    }

    return info
  }

  private parseEpicsFile = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    // Count epic completion
    const totalEpics = (content.match(/^#{2,3}\s/gm) || []).length
    const completedEpics = (content.match(/^#{2,3}\s.*(?:complete|done|✓)/gmi) || []).length
    
    if (totalEpics > 0) {
      info.phases = {
        current: completedEpics,
        total: totalEpics,
      }
    }

    return info
  }

  private parseTodoFile = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    const totalItems = (content.match(/^\s*-\s/gm) || []).length
    const completedItems = (content.match(/^\s*-\s.*(?:done|complete|✓)/gmi) || []).length
    
    info.todos = totalItems - completedItems
    
    if (totalItems > 0) {
      info.phases = {
        current: completedItems,
        total: totalItems,
      }
    }

    return info
  }

  private parseGenericFile = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    // Count TODO items
    const todoMatches = content.match(/(?:TODO|FIXME|HACK|NOTE)\b/gi)
    if (todoMatches) {
      info.todos = todoMatches.length
    }

    return info
  }

  private parseReadmeFile = (content: string): TrackingInfo => {
    const info: TrackingInfo = {}
    
    // Extract first meaningful description
    const lines = content.split('\n')
    let foundTitle = false
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      if (!foundTitle && trimmed.startsWith('#')) {
        foundTitle = true
        continue
      }
      
      if (foundTitle && trimmed.length > 20 && !trimmed.startsWith('#')) {
        info.description = trimmed
        break
      }
    }

    return info
  }
}
