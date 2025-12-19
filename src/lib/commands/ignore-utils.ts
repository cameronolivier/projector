import * as path from 'path'
import { AnalyzedProject, ProjectsConfig } from '../types.js'
import { IgnoreMatcher } from '../discovery/ignore-matcher.js'

export interface PatternResult {
  pattern: string
  matches: string[]
  type: 'suffix' | 'prefix' | 'path' | 'version' | 'exact'
}

export interface PatternGenerationOptions {
  mode: 'smart' | 'exact'
  verbose: boolean
}

export interface ValidationResult {
  valid: boolean
  unintendedMatches: string[]
}

/**
 * Detect suffix patterns (e.g., *-old, *-backup)
 */
export function detectSuffixPatterns(projectNames: string[]): Map<string, string[]> {
  const suffixMap = new Map<string, string[]>()

  for (const name of projectNames) {
    // Look for common suffix patterns
    const suffixMatch = name.match(/^(.+)-(old|backup|archive|deprecated|legacy|temp|tmp|test|v\d+)$/)
    if (suffixMatch) {
      const suffix = suffixMatch[2]
      const pattern = `*-${suffix}`
      if (!suffixMap.has(pattern)) {
        suffixMap.set(pattern, [])
      }
      suffixMap.get(pattern)!.push(name)
    }
  }

  // Only return patterns that match at least 2 projects
  const result = new Map<string, string[]>()
  for (const [pattern, matches] of suffixMap.entries()) {
    if (matches.length >= 2) {
      result.set(pattern, matches)
    }
  }

  return result
}

/**
 * Detect prefix patterns (e.g., test-*, old-*, archive-*)
 */
export function detectPrefixPatterns(projectNames: string[]): Map<string, string[]> {
  const prefixMap = new Map<string, string[]>()

  for (const name of projectNames) {
    // Look for common prefix patterns
    const prefixMatch = name.match(/^(test|old|archive|backup|temp|tmp|demo|example|sample|prototype)-(.+)$/)
    if (prefixMatch) {
      const prefix = prefixMatch[1]
      const pattern = `${prefix}-*`
      if (!prefixMap.has(pattern)) {
        prefixMap.set(pattern, [])
      }
      prefixMap.get(pattern)!.push(name)
    }
  }

  // Only return patterns that match at least 2 projects
  const result = new Map<string, string[]>()
  for (const [pattern, matches] of prefixMap.entries()) {
    if (matches.length >= 2) {
      result.set(pattern, matches)
    }
  }

  return result
}

/**
 * Detect path-based patterns (e.g., archive and backup directories)
 */
export function detectPathPatterns(projectPaths: string[]): Map<string, string[]> {
  const pathMap = new Map<string, string[]>()

  for (const projectPath of projectPaths) {
    const pathParts = projectPath.split(path.sep)

    // Look for common directory names in the path
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i]
      if (['archive', 'backup', 'old', 'deprecated', 'temp', 'tmp', 'test'].includes(part.toLowerCase())) {
        const pattern = `**/${part}/*`
        if (!pathMap.has(pattern)) {
          pathMap.set(pattern, [])
        }
        pathMap.get(pattern)!.push(projectPath)
      }
    }
  }

  // Only return patterns that match at least 2 projects
  const result = new Map<string, string[]>()
  for (const [pattern, matches] of pathMap.entries()) {
    if (matches.length >= 2) {
      result.set(pattern, matches)
    }
  }

  return result
}

/**
 * Validate that a pattern only matches intended projects
 */
export function validatePattern(
  pattern: string,
  intendedMatches: string[],
  allProjectNames: string[]
): ValidationResult {
  const ignoreMatcher = new IgnoreMatcher({
    patterns: [pattern],
    useIgnoreFiles: false,
    ignoreFileName: '.projectorignore',
    directories: [],
  })

  const unintendedMatches: string[] = []

  for (const projectName of allProjectNames) {
    const mockProject: AnalyzedProject = {
      name: projectName,
      path: `/mock/${projectName}`,
      type: 'Unknown' as any,
      languages: [],
      hasGit: false,
      files: [],
      status: { type: 'unknown', details: '', confidence: 0 },
      description: '',
      trackingFiles: [],
      confidence: 0,
      lastModified: new Date(),
    }

    const shouldIgnore = ignoreMatcher.shouldIgnoreProject(mockProject)
    const isIntended = intendedMatches.includes(projectName)

    if (shouldIgnore && !isIntended) {
      unintendedMatches.push(projectName)
    }
  }

  return {
    valid: unintendedMatches.length === 0,
    unintendedMatches,
  }
}

/**
 * Deduplicate patterns by removing redundant ones
 */
export function deduplicatePatterns(
  patterns: string[],
  allProjects: AnalyzedProject[]
): string[] {
  // Create a map of pattern -> matched projects
  const patternMatches = new Map<string, Set<string>>()

  for (const pattern of patterns) {
    const ignoreMatcher = new IgnoreMatcher({
      patterns: [pattern],
      useIgnoreFiles: false,
      ignoreFileName: '.projectorignore',
      directories: [],
    })

    const matches = new Set<string>()
    for (const project of allProjects) {
      if (ignoreMatcher.shouldIgnoreProject(project)) {
        matches.add(project.name)
      }
    }
    patternMatches.set(pattern, matches)
  }

  // Remove patterns whose matches are a subset of another pattern's matches
  const deduplicated: string[] = []

  for (const [pattern, matches] of patternMatches.entries()) {
    let isRedundant = false

    for (const [otherPattern, otherMatches] of patternMatches.entries()) {
      if (pattern === otherPattern) continue

      // Check if this pattern's matches are a subset of another pattern's matches
      const isSubset = [...matches].every((m) => otherMatches.has(m))
      if (isSubset && matches.size < otherMatches.size) {
        isRedundant = true
        break
      }
    }

    if (!isRedundant) {
      deduplicated.push(pattern)
    }
  }

  return deduplicated
}

/**
 * Load current ignore state for all projects
 */
export function loadCurrentIgnoreState(
  projects: AnalyzedProject[],
  config: ProjectsConfig
): Map<string, boolean> {
  const ignoreMatcher = new IgnoreMatcher(config.ignore)
  const ignoreState = new Map<string, boolean>()

  for (const project of projects) {
    const isIgnored = ignoreMatcher.shouldIgnoreProject(project)
    ignoreState.set(project.path, isIgnored)
  }

  return ignoreState
}

/**
 * Generate smart ignore patterns from selected projects
 */
export function generateIgnorePatterns(
  projectsToIgnore: AnalyzedProject[],
  allProjects: AnalyzedProject[],
  options: PatternGenerationOptions
): PatternResult[] {
  if (options.mode === 'exact') {
    // Return exact project names
    return projectsToIgnore.map((p) => ({
      pattern: p.name,
      matches: [p.name],
      type: 'exact' as const,
    }))
  }

  const results: PatternResult[] = []
  const projectNames = projectsToIgnore.map((p) => p.name)
  const projectPaths = projectsToIgnore.map((p) => p.path)
  const allProjectNames = allProjects.map((p) => p.name)
  const unmatchedProjects = new Set(projectNames)

  // Detect suffix patterns
  const suffixPatterns = detectSuffixPatterns(projectNames)
  for (const [pattern, matches] of suffixPatterns.entries()) {
    const validation = validatePattern(pattern, matches, allProjectNames)
    if (validation.valid) {
      results.push({ pattern, matches, type: 'suffix' })
      matches.forEach((m) => unmatchedProjects.delete(m))
    } else if (options.verbose) {
      console.log(`  ⚠️  Pattern "${pattern}" would match unintended projects: ${validation.unintendedMatches.join(', ')}`)
    }
  }

  // Detect prefix patterns
  const prefixPatterns = detectPrefixPatterns(projectNames)
  for (const [pattern, matches] of prefixPatterns.entries()) {
    const validation = validatePattern(pattern, matches, allProjectNames)
    if (validation.valid) {
      results.push({ pattern, matches, type: 'prefix' })
      matches.forEach((m) => unmatchedProjects.delete(m))
    } else if (options.verbose) {
      console.log(`  ⚠️  Pattern "${pattern}" would match unintended projects: ${validation.unintendedMatches.join(', ')}`)
    }
  }

  // Detect path patterns
  const pathPatterns = detectPathPatterns(projectPaths)
  for (const [pattern, matchPaths] of pathPatterns.entries()) {
    const matchNames = matchPaths.map((p) => path.basename(p))
    const validation = validatePattern(pattern, matchNames, allProjectNames)
    if (validation.valid) {
      results.push({ pattern, matches: matchNames, type: 'path' })
      matchNames.forEach((m) => unmatchedProjects.delete(m))
    } else if (options.verbose) {
      console.log(`  ⚠️  Pattern "${pattern}" would match unintended projects: ${validation.unintendedMatches.join(', ')}`)
    }
  }

  // Add exact patterns for remaining unmatched projects
  for (const projectName of unmatchedProjects) {
    results.push({
      pattern: projectName,
      matches: [projectName],
      type: 'exact',
    })
  }

  return results
}

/**
 * Merge new ignore patterns with existing ones
 */
export function mergeIgnorePatterns(
  currentPatterns: string[],
  newPatternResults: PatternResult[],
  projectsToUnignore: AnalyzedProject[],
  allProjects: AnalyzedProject[]
): string[] {
  const newPatterns = newPatternResults.map((r) => r.pattern)
  const unignoreNames = new Set(projectsToUnignore.map((p) => p.name))

  // Filter out patterns that match projects we want to unignore
  const filteredCurrentPatterns = currentPatterns.filter((pattern) => {
    const ignoreMatcher = new IgnoreMatcher({
      patterns: [pattern],
      useIgnoreFiles: false,
      ignoreFileName: '.projectorignore',
      directories: [],
    })

    // Check if this pattern matches any project we want to unignore
    for (const project of projectsToUnignore) {
      if (ignoreMatcher.shouldIgnoreProject(project)) {
        return false // Remove this pattern
      }
    }

    return true // Keep this pattern
  })

  // Combine filtered current patterns with new patterns
  const combined = [...new Set([...filteredCurrentPatterns, ...newPatterns])]

  // Deduplicate
  return deduplicatePatterns(combined, allProjects)
}
