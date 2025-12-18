import * as fs from 'fs/promises'
import * as path from 'path'
import { glob } from 'glob'
import { ProjectDirectory, IgnoreConfig } from '../types.js'

export interface IgnoreRule {
  pattern: string
  type: 'basename' | 'glob' | 'project-name'
  negated: boolean
  source: string // 'config' or path to .projectorignore
}

export interface IgnoreContext {
  rules: IgnoreRule[]
  directory: string
  parent?: IgnoreContext
}

export class IgnoreMatcher {
  private config: IgnoreConfig
  private fileCache: Map<string, IgnoreRule[]> = new Map()

  constructor(config?: IgnoreConfig) {
    this.config = config || {
      patterns: [],
      useIgnoreFiles: true,
      ignoreFileName: '.projectorignore',
      directories: [],
    }
  }

  /**
   * Parse .projectorignore file content into rules
   */
  parseIgnoreFile(content: string, filePath: string): IgnoreRule[] {
    const rules: IgnoreRule[] = []
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      // Check for negation
      const negated = trimmed.startsWith('!')
      const pattern = negated ? trimmed.substring(1) : trimmed

      // Determine rule type based on pattern
      let type: 'basename' | 'glob' | 'project-name' = 'basename'

      if (glob.hasMagic(pattern)) {
        type = 'glob'
      } else if (pattern.includes('/') || pattern.startsWith('./')) {
        type = 'glob' // Treat path-based patterns as glob
      }

      rules.push({
        pattern,
        type,
        negated,
        source: filePath,
      })
    }

    return rules
  }

  /**
   * Check if directory should be ignored during traversal
   */
  shouldIgnoreDirectory(dirPath: string, basename: string, context?: IgnoreContext): boolean {
    // Collect all rules from context chain
    const allRules: IgnoreRule[] = []
    if (context) {
      this.collectRulesFromContext(context, allRules)
    }

    // Add global config patterns
    this.addConfigRules(allRules)

    // Check rules in order (later rules override earlier ones)
    // Negated rules take precedence over non-negated when they match
    let ignored = false
    for (const rule of allRules) {
      if (this.matchRule(rule, dirPath, basename)) {
        ignored = !rule.negated
      }
    }

    return ignored
  }

  /**
   * Check if project should be filtered after discovery
   */
  shouldIgnoreProject(project: ProjectDirectory): boolean {
    const rules: IgnoreRule[] = []

    // Add global config patterns as project-name rules
    if (this.config.patterns && this.config.patterns.length > 0) {
      for (const pattern of this.config.patterns) {
        rules.push({
          pattern,
          type: glob.hasMagic(pattern) ? 'glob' : 'project-name',
          negated: false,
          source: 'config',
        })
      }
    }

    // Check if project name or path matches any pattern
    // Later rules override earlier ones
    let shouldFilter = false
    for (const rule of rules) {
      const matched =
        this.matchPattern(rule.pattern, project.name, 'project-name') ||
        this.matchPattern(rule.pattern, project.path, 'glob')

      if (matched) {
        shouldFilter = !rule.negated
      }
    }

    return shouldFilter
  }

  /**
   * Load .projectorignore from directory if exists
   */
  async loadIgnoreFile(dirPath: string): Promise<IgnoreRule[]> {
    const ignoreFileName = this.config.ignoreFileName || '.projectorignore'
    const ignoreFilePath = path.join(dirPath, ignoreFileName)

    // Check cache first
    if (this.fileCache.has(ignoreFilePath)) {
      return this.fileCache.get(ignoreFilePath)!
    }

    try {
      const content = await fs.readFile(ignoreFilePath, 'utf-8')
      const rules = this.parseIgnoreFile(content, ignoreFilePath)
      this.fileCache.set(ignoreFilePath, rules)
      return rules
    } catch (error) {
      // File doesn't exist or can't be read - return empty rules
      const emptyRules: IgnoreRule[] = []
      this.fileCache.set(ignoreFilePath, emptyRules)
      return emptyRules
    }
  }

  /**
   * Build cumulative ignore context for directory
   */
  async buildContext(dirPath: string, parentContext?: IgnoreContext): Promise<IgnoreContext> {
    const rules: IgnoreRule[] = []

    // Load .projectorignore file if enabled
    if (this.config.useIgnoreFiles) {
      const fileRules = await this.loadIgnoreFile(dirPath)
      rules.push(...fileRules)
    }

    return {
      rules,
      directory: dirPath,
      parent: parentContext,
    }
  }

  /**
   * Helper: match pattern against path
   */
  private matchPattern(pattern: string, target: string, type: 'basename' | 'glob' | 'project-name'): boolean {
    try {
      // Fast path: exact match
      if (pattern === target) {
        return true
      }

      // For basename matching
      if (type === 'basename') {
        const basename = path.basename(target)
        if (glob.hasMagic(pattern)) {
          return this.simpleGlobMatch(pattern, basename)
        }
        return basename === pattern
      }

      // For project name matching
      if (type === 'project-name') {
        const projectName = path.basename(target)
        if (glob.hasMagic(pattern)) {
          return this.simpleGlobMatch(pattern, projectName)
        }
        return projectName === pattern || target === pattern
      }

      // For glob path matching
      if (glob.hasMagic(pattern)) {
        return this.simpleGlobMatch(pattern, target)
      }

      // Path substring matching
      return target.includes(pattern)
    } catch (error) {
      // Invalid pattern, warn and skip
      console.warn(`Invalid ignore pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * Simple glob pattern matching (supports * and **)
   */
  private simpleGlobMatch(pattern: string, target: string): boolean {
    // Convert glob pattern to regex
    // Escape special regex characters except * and ?
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§DOUBLESTAR§') // Temporary placeholder
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/§DOUBLESTAR§/g, '.*') // ** matches anything including /
      .replace(/\?/g, '.') // ? matches single character

    // Always add anchors for exact matching
    const anchoredPattern = '^' + regexPattern + '$'

    const regex = new RegExp(anchoredPattern)
    return regex.test(target)
  }

  /**
   * Helper: collect all rules from context chain
   */
  private collectRulesFromContext(context: IgnoreContext, rules: IgnoreRule[]): void {
    if (context.parent) {
      this.collectRulesFromContext(context.parent, rules)
    }
    rules.push(...context.rules)
  }

  /**
   * Helper: add global config rules
   */
  private addConfigRules(rules: IgnoreRule[]): void {
    // Add directory basename patterns
    if (this.config.directories && this.config.directories.length > 0) {
      for (const dir of this.config.directories) {
        rules.push({
          pattern: dir,
          type: 'basename',
          negated: false,
          source: 'config',
        })
      }
    }

    // Add global patterns (for directory matching during scan)
    if (this.config.patterns && this.config.patterns.length > 0) {
      for (const pattern of this.config.patterns) {
        rules.push({
          pattern,
          type: glob.hasMagic(pattern) ? 'glob' : 'basename',
          negated: false,
          source: 'config',
        })
      }
    }
  }

  /**
   * Helper: match a rule against a path
   */
  private matchRule(rule: IgnoreRule, dirPath: string, basename: string): boolean {
    // For glob patterns without path separators, match against basename
    // For glob patterns with path separators or **, match against full path
    if (rule.type === 'glob' && !rule.pattern.includes('/') && !rule.pattern.includes('**')) {
      return this.matchPattern(rule.pattern, basename, rule.type)
    }
    return this.matchPattern(rule.pattern, rule.type === 'basename' ? basename : dirPath, rule.type)
  }
}
