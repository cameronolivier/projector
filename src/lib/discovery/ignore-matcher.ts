import * as path from 'path'
import { glob } from 'glob'
import { ProjectDirectory, IgnoreConfig } from '../types.js'

export class IgnoreMatcher {
  private config: IgnoreConfig

  constructor(config?: IgnoreConfig) {
    this.config = config || {
      patterns: [],
      directories: [],
    }
  }

  /**
   * Check if directory should be ignored during traversal
   */
  shouldIgnoreDirectory(dirPath: string, basename: string): boolean {
    // Check directory basenames
    if (this.config.directories && this.config.directories.length > 0) {
      if (this.config.directories.includes(basename)) {
        return true
      }
    }

    // Check patterns
    if (this.config.patterns && this.config.patterns.length > 0) {
      for (const pattern of this.config.patterns) {
        if (this.matchPattern(pattern, basename, 'basename') || this.matchPattern(pattern, dirPath, 'glob')) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if project should be filtered after discovery
   */
  shouldIgnoreProject(project: ProjectDirectory): boolean {
    if (this.config.patterns && this.config.patterns.length > 0) {
      for (const pattern of this.config.patterns) {
        const matchesName = this.matchPattern(pattern, project.name, 'project-name')
        const matchesPath = this.matchPattern(pattern, project.path, 'glob')
        if (matchesName || matchesPath) {
          return true
        }
      }
    }
    return false
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
}
