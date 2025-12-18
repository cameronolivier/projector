import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { parse, stringify } from 'yaml'
import { ProjectsConfig, TrackingPattern, TrackingType, ColorScheme, TrackingInfo, TemplateDefinition, GitInsightsConfig, TagConfig, IgnoreConfig } from '../types.js'
import { DEFAULT_TAG_PALETTE } from '../tags/palette.js'

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

  // Returns absolute path to the config file
  getPath(): string {
    return this.configPath
  }

  getDefaultConfig(): ProjectsConfig {
    const configDir = path.dirname(this.getConfigPath())
    const templatesDir = path.join(configDir, 'templates')
    const builtinTemplates: TemplateDefinition[] = [
      {
        id: 'node-service',
        name: 'Node Service',
        description: 'Opinionated TypeScript service with pnpm + lint/test wiring',
        tags: ['node', 'service'],
        source: { type: 'builtin', builtinId: 'node-service' },
        variables: [
          { key: 'serviceName', prompt: 'Service name', required: true },
          { key: 'description', prompt: 'Service description', default: 'Awesome service built with Projector templates' },
        ],
        postCommands: ['pnpm install'],
      },
      {
        id: 'docs-site',
        name: 'Docs Site',
        description: 'Docs-first project with Docusaurus-style skeleton',
        tags: ['docs'],
        source: { type: 'builtin', builtinId: 'docs-site' },
        variables: [
          { key: 'projectName', prompt: 'Project name', required: true },
        ],
      },
    ]

    return {
      scanDirectory: '/Users/cam/nona-mac/dev',
      maxDepth: 10,
      // Interactive behavior defaults
      defaultInteractive: true,
      defaultEditor: undefined,
      cdSentinel: '__PROJECTOR_CD__',
      trackingPatterns: this.getDefaultTrackingPatterns(),
      descriptions: {
        'bb': 'Bitbucket CLI with GitHub parity',
        'serena': 'External dependency project',
        'projector': 'Development project management CLI tool',
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
      // Default behavior: stop descending into directories that contain a package.json
      stopAtNodePackageRoot: true,
      // Root detection extensions
      rootMarkers: [
        'package.json',
        'pyproject.toml',
        'Cargo.toml',
        'go.mod',
        'composer.json',
        'pom.xml',
        'build.gradle',
        'settings.gradle',
        'CMakeLists.txt',
        'Makefile',
        'Gemfile',
      ],
      monorepoMarkers: [
        'pnpm-workspace.yaml',
        'lerna.json',
        'turbo.json',
        'nx.json',
        'go.work',
      ],
      lockfilesAsStrong: true,
      minCodeFilesToConsider: 5,
      stopAtVcsRoot: true,
      includeNestedPackages: 'when-monorepo',
      respectGitIgnore: false,
      denylistPaths: [
        'examples',
        'fixtures',
        'samples',
        'docs/site',
      ],
      templatesDir,
      templates: builtinTemplates,
      tags: {
        enabled: true,
        style: 'badge',
        maxLength: 12,
        colorPalette: DEFAULT_TAG_PALETTE.map(color => ({ ...color })),
      },
      colorScheme: {
        header: '#00d4ff',      // Bright cyan
        phaseStatus: '#ff6b35',  // Orange
        stableStatus: '#4caf50', // Green
        unknownStatus: '#9e9e9e', // Gray
        projectName: '#ffffff',  // White
      },
      ignore: {
        patterns: [],
        useIgnoreFiles: true,
        ignoreFileName: '.projectorignore',
        directories: [],
      },
      gitInsights: this.getDefaultGitInsightsConfig(),
    }
  }

  mergeWithDefaults(userConfig: Partial<ProjectsConfig>): ProjectsConfig {
    const defaults = this.getDefaultConfig()
    
    return {
      scanDirectory: userConfig.scanDirectory || defaults.scanDirectory,
      maxDepth: userConfig.maxDepth || defaults.maxDepth,
      defaultInteractive:
        typeof (userConfig as any).defaultInteractive === 'boolean'
          ? (userConfig as any).defaultInteractive
          : defaults.defaultInteractive,
      defaultEditor: (userConfig as any).defaultEditor || defaults.defaultEditor,
      cdSentinel: (userConfig as any).cdSentinel || defaults.cdSentinel,
      trackingPatterns: userConfig.trackingPatterns || defaults.trackingPatterns,
      descriptions: { ...defaults.descriptions, ...userConfig.descriptions },
      ignorePatterns: userConfig.ignorePatterns || defaults.ignorePatterns,
      codeFileExtensions: userConfig.codeFileExtensions || defaults.codeFileExtensions,
      stopAtNodePackageRoot:
        typeof (userConfig as any).stopAtNodePackageRoot === 'boolean'
          ? (userConfig as any).stopAtNodePackageRoot
          : defaults.stopAtNodePackageRoot,
      rootMarkers: (userConfig as any).rootMarkers || defaults.rootMarkers,
      monorepoMarkers: (userConfig as any).monorepoMarkers || defaults.monorepoMarkers,
      lockfilesAsStrong:
        typeof (userConfig as any).lockfilesAsStrong === 'boolean'
          ? (userConfig as any).lockfilesAsStrong
          : defaults.lockfilesAsStrong,
      minCodeFilesToConsider: (userConfig as any).minCodeFilesToConsider || defaults.minCodeFilesToConsider,
      stopAtVcsRoot:
        typeof (userConfig as any).stopAtVcsRoot === 'boolean'
          ? (userConfig as any).stopAtVcsRoot
          : defaults.stopAtVcsRoot,
      includeNestedPackages: (userConfig as any).includeNestedPackages || defaults.includeNestedPackages,
      respectGitIgnore:
        typeof (userConfig as any).respectGitIgnore === 'boolean'
          ? (userConfig as any).respectGitIgnore
          : defaults.respectGitIgnore,
      denylistPaths: (userConfig as any).denylistPaths || defaults.denylistPaths,
      templatesDir: (userConfig as any).templatesDir || defaults.templatesDir,
      templates: this.mergeTemplates(defaults.templates || [], (userConfig as any).templates || []),
      tags: this.mergeTags(defaults.tags, (userConfig as any).tags),
      colorScheme: { ...defaults.colorScheme, ...userConfig.colorScheme },
      ignore: this.mergeIgnoreConfig(defaults.ignore!, userConfig.ignorePatterns, (userConfig as any).ignore),
      gitInsights: this.mergeGitInsights(defaults.gitInsights, (userConfig as any).gitInsights),
    }
  }

  private mergeTemplates(defaults: TemplateDefinition[], overrides: TemplateDefinition[]): TemplateDefinition[] {
    if (!overrides || overrides.length === 0) return defaults
    const merged = new Map<string, TemplateDefinition>()
    for (const tpl of defaults) {
      merged.set(tpl.id, tpl)
    }
    for (const tpl of overrides) {
      merged.set(tpl.id, tpl)
    }
    return Array.from(merged.values())
  }

  private getDefaultGitInsightsConfig(): GitInsightsConfig {
    return {
      enabled: true,
      activityWindowDays: 30,
      shortWindowDays: 7,
      staleBranchThresholdDays: 90,
      maxBranches: 5,
      cacheTtlHours: 6,
    }
  }

  private mergeTags(defaults: TagConfig, overrides?: Partial<TagConfig>): TagConfig {
    if (!overrides) {
      return {
        enabled: defaults.enabled,
        style: defaults.style,
        maxLength: defaults.maxLength,
        colorPalette: defaults.colorPalette.map(color => ({ ...color })),
      }
    }

    const palette =
      overrides.colorPalette && overrides.colorPalette.length > 0
        ? overrides.colorPalette.map(color => ({ ...color }))
        : defaults.colorPalette.map(color => ({ ...color }))

    return {
      enabled: typeof overrides.enabled === 'boolean' ? overrides.enabled : defaults.enabled,
      style: overrides.style || defaults.style,
      maxLength: overrides.maxLength || defaults.maxLength,
      colorPalette: palette,
    }
  }

  private mergeIgnoreConfig(defaults: IgnoreConfig, legacyIgnorePatterns?: string[], overrides?: Partial<IgnoreConfig>): IgnoreConfig {
    const result: IgnoreConfig = {
      patterns: overrides?.patterns || defaults.patterns || [],
      useIgnoreFiles: typeof overrides?.useIgnoreFiles === 'boolean' ? overrides.useIgnoreFiles : defaults.useIgnoreFiles,
      ignoreFileName: overrides?.ignoreFileName || defaults.ignoreFileName,
      directories: overrides?.directories || defaults.directories || [],
    }

    // Migrate legacy ignorePatterns to directories if not already set
    if (legacyIgnorePatterns && legacyIgnorePatterns.length > 0 && (!result.directories || result.directories.length === 0)) {
      result.directories = legacyIgnorePatterns
    }

    return result
  }

  private mergeGitInsights(defaults?: GitInsightsConfig, overrides?: Partial<GitInsightsConfig>): GitInsightsConfig | undefined {
    if (!defaults && !overrides) {
      return undefined
    }

    if (!defaults) {
      return overrides as GitInsightsConfig
    }

    if (!overrides) {
      return defaults
    }

    return {
      enabled: typeof overrides.enabled === 'boolean' ? overrides.enabled : defaults.enabled,
      activityWindowDays: overrides.activityWindowDays || defaults.activityWindowDays,
      shortWindowDays: overrides.shortWindowDays || defaults.shortWindowDays,
      staleBranchThresholdDays: overrides.staleBranchThresholdDays || defaults.staleBranchThresholdDays,
      maxBranches: overrides.maxBranches || defaults.maxBranches,
      cacheTtlHours: overrides.cacheTtlHours || defaults.cacheTtlHours,
    }
  }

  private getConfigPath(): string {
    // Follow XDG Base Directory Specification
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configHome, 'projector', 'config.yaml')
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
