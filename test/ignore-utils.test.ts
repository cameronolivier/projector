import {
  detectSuffixPatterns,
  detectPrefixPatterns,
  detectPathPatterns,
  validatePattern,
  deduplicatePatterns,
  loadCurrentIgnoreState,
  generateIgnorePatterns,
  mergeIgnorePatterns,
} from '../src/lib/commands/ignore-utils.js'
import { ProjectType, type AnalyzedProject, type ProjectsConfig } from '../src/lib/types.js'

// Helper to create mock project
function createMockProject(name: string, path: string = `/mock/${name}`): AnalyzedProject {
  return {
    name,
    path,
    type: ProjectType.NodeJS,
    languages: ['typescript'],
    hasGit: false,
    files: [],
    status: { type: 'active', details: '', confidence: 0 },
    description: '',
    trackingFiles: [],
    confidence: 0,
    lastModified: new Date(),
  }
}

describe('detectSuffixPatterns', () => {
  test('detects *-old pattern from multiple projects', () => {
    const projectNames = ['api-old', 'web-old', 'worker-old', 'current-api']
    const patterns = detectSuffixPatterns(projectNames)

    expect(patterns.has('*-old')).toBe(true)
    expect(patterns.get('*-old')).toEqual(['api-old', 'web-old', 'worker-old'])
  })

  test('detects *-backup pattern', () => {
    const projectNames = ['api-backup', 'db-backup', 'active-project']
    const patterns = detectSuffixPatterns(projectNames)

    expect(patterns.has('*-backup')).toBe(true)
    expect(patterns.get('*-backup')).toEqual(['api-backup', 'db-backup'])
  })

  test('detects *-v1 version pattern', () => {
    const projectNames = ['api-v1', 'web-v1', 'api-v2']
    const patterns = detectSuffixPatterns(projectNames)

    expect(patterns.has('*-v1')).toBe(true)
    expect(patterns.get('*-v1')).toEqual(['api-v1', 'web-v1'])
  })

  test('requires at least 2 matches', () => {
    const projectNames = ['api-old', 'web-current']
    const patterns = detectSuffixPatterns(projectNames)

    expect(patterns.size).toBe(0)
  })

  test('handles empty input', () => {
    const patterns = detectSuffixPatterns([])
    expect(patterns.size).toBe(0)
  })

  test('detects multiple different suffix patterns', () => {
    const projectNames = ['api-old', 'web-old', 'db-backup', 'cache-backup', 'test-archive']
    const patterns = detectSuffixPatterns(projectNames)

    expect(patterns.has('*-old')).toBe(true)
    expect(patterns.has('*-backup')).toBe(true)
    expect(patterns.has('*-archive')).toBe(false) // Only 1 match
  })
})

describe('detectPrefixPatterns', () => {
  test('detects test-* pattern from multiple projects', () => {
    const projectNames = ['test-api', 'test-web', 'test-worker', 'production-api']
    const patterns = detectPrefixPatterns(projectNames)

    expect(patterns.has('test-*')).toBe(true)
    expect(patterns.get('test-*')).toEqual(['test-api', 'test-web', 'test-worker'])
  })

  test('detects old-* pattern', () => {
    const projectNames = ['old-api', 'old-web', 'current-api']
    const patterns = detectPrefixPatterns(projectNames)

    expect(patterns.has('old-*')).toBe(true)
    expect(patterns.get('old-*')).toEqual(['old-api', 'old-web'])
  })

  test('detects demo-* pattern', () => {
    const projectNames = ['demo-app', 'demo-service', 'production-app']
    const patterns = detectPrefixPatterns(projectNames)

    expect(patterns.has('demo-*')).toBe(true)
    expect(patterns.get('demo-*')).toEqual(['demo-app', 'demo-service'])
  })

  test('requires at least 2 matches', () => {
    const projectNames = ['test-api', 'production-web']
    const patterns = detectPrefixPatterns(projectNames)

    expect(patterns.size).toBe(0)
  })

  test('handles empty input', () => {
    const patterns = detectPrefixPatterns([])
    expect(patterns.size).toBe(0)
  })

  test('detects multiple different prefix patterns', () => {
    const projectNames = ['test-api', 'test-web', 'old-db', 'old-cache', 'demo-app']
    const patterns = detectPrefixPatterns(projectNames)

    expect(patterns.has('test-*')).toBe(true)
    expect(patterns.has('old-*')).toBe(true)
    expect(patterns.has('demo-*')).toBe(false) // Only 1 match
  })
})

describe('detectPathPatterns', () => {
  test('detects **/archive/* pattern from multiple paths', () => {
    const projectPaths = ['/home/user/archive/api', '/home/user/archive/web', '/home/user/current/app']
    const patterns = detectPathPatterns(projectPaths)

    expect(patterns.has('**/archive/*')).toBe(true)
    expect(patterns.get('**/archive/*')).toEqual(['/home/user/archive/api', '/home/user/archive/web'])
  })

  test('detects **/backup/* pattern', () => {
    const projectPaths = ['/projects/backup/api', '/projects/backup/web', '/projects/main/app']
    const patterns = detectPathPatterns(projectPaths)

    expect(patterns.has('**/backup/*')).toBe(true)
    expect(patterns.get('**/backup/*')).toEqual(['/projects/backup/api', '/projects/backup/web'])
  })

  test('detects **/old/* pattern', () => {
    const projectPaths = ['/code/old/api', '/code/old/web', '/code/new/app']
    const patterns = detectPathPatterns(projectPaths)

    expect(patterns.has('**/old/*')).toBe(true)
  })

  test('requires at least 2 matches', () => {
    const projectPaths = ['/home/archive/api', '/home/current/web']
    const patterns = detectPathPatterns(projectPaths)

    expect(patterns.size).toBe(0)
  })

  test('handles empty input', () => {
    const patterns = detectPathPatterns([])
    expect(patterns.size).toBe(0)
  })

  test('case-insensitive directory matching', () => {
    const projectPaths = ['/home/Archive/api', '/home/Archive/web']
    const patterns = detectPathPatterns(projectPaths)

    expect(patterns.has('**/Archive/*')).toBe(true)
  })
})

describe('validatePattern', () => {
  test('validates pattern that only matches intended projects', () => {
    const pattern = '*-old'
    const intendedMatches = ['api-old', 'web-old']
    const allProjectNames = ['api-old', 'web-old', 'api-current', 'web-current']

    const result = validatePattern(pattern, intendedMatches, allProjectNames)

    expect(result.valid).toBe(true)
    expect(result.unintendedMatches).toEqual([])
  })

  test('rejects pattern that matches unintended projects', () => {
    const pattern = '*-old'
    const intendedMatches = ['api-old', 'web-old']
    const allProjectNames = ['api-old', 'web-old', 'db-old', 'api-current'] // db-old is unintended

    const result = validatePattern(pattern, intendedMatches, allProjectNames)

    expect(result.valid).toBe(false)
    expect(result.unintendedMatches).toContain('db-old')
  })

  test('validates exact match pattern', () => {
    const pattern = 'specific-project'
    const intendedMatches = ['specific-project']
    const allProjectNames = ['specific-project', 'other-project', 'another-project']

    const result = validatePattern(pattern, intendedMatches, allProjectNames)

    expect(result.valid).toBe(true)
    expect(result.unintendedMatches).toEqual([])
  })

  test('validates prefix pattern correctly', () => {
    const pattern = 'test-*'
    const intendedMatches = ['test-api', 'test-web']
    const allProjectNames = ['test-api', 'test-web', 'testing-utils', 'production-api']

    const result = validatePattern(pattern, intendedMatches, allProjectNames)

    // Should be valid because testing-utils doesn't match test-* (no hyphen)
    expect(result.valid).toBe(true)
  })
})

describe('deduplicatePatterns', () => {
  test('removes exact patterns covered by wildcard pattern', () => {
    const patterns = ['*-old', 'api-old', 'web-old']
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('current-api'),
    ]

    const deduplicated = deduplicatePatterns(patterns, allProjects)

    expect(deduplicated).toContain('*-old')
    expect(deduplicated).not.toContain('api-old')
    expect(deduplicated).not.toContain('web-old')
  })

  test('keeps patterns that match different sets', () => {
    const patterns = ['*-old', 'test-*']
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('test-api'),
      createMockProject('test-web'),
    ]

    const deduplicated = deduplicatePatterns(patterns, allProjects)

    expect(deduplicated).toContain('*-old')
    expect(deduplicated).toContain('test-*')
  })

  test('handles empty pattern list', () => {
    const deduplicated = deduplicatePatterns([], [])
    expect(deduplicated).toEqual([])
  })

  test('keeps exact patterns when no overlap', () => {
    const patterns = ['api-old', 'web-backup', 'test-service']
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-backup'),
      createMockProject('test-service'),
    ]

    const deduplicated = deduplicatePatterns(patterns, allProjects)

    expect(deduplicated.length).toBe(3)
  })
})

describe('loadCurrentIgnoreState', () => {
  test('identifies currently ignored projects', () => {
    const projects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('current-api'),
    ]

    const config: ProjectsConfig = {
      ignore: {
        patterns: ['*-old'],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
        directories: [],
      },
    } as any

    const state = loadCurrentIgnoreState(projects, config)

    expect(state.get('/mock/api-old')).toBe(true)
    expect(state.get('/mock/web-old')).toBe(true)
    expect(state.get('/mock/current-api')).toBe(false)
  })

  test('handles no ignore patterns', () => {
    const projects = [createMockProject('api'), createMockProject('web')]

    const config: ProjectsConfig = {
      ignore: {
        patterns: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
        directories: [],
      },
    } as any

    const state = loadCurrentIgnoreState(projects, config)

    expect(state.get('/mock/api')).toBe(false)
    expect(state.get('/mock/web')).toBe(false)
  })
})

describe('generateIgnorePatterns', () => {
  test('generates smart suffix patterns', () => {
    const projectsToIgnore = [createMockProject('api-old'), createMockProject('web-old')]
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('current-api'),
    ]

    const results = generateIgnorePatterns(projectsToIgnore, allProjects, { mode: 'smart', verbose: false })

    expect(results).toHaveLength(1)
    expect(results[0].pattern).toBe('*-old')
    expect(results[0].type).toBe('suffix')
    expect(results[0].matches).toEqual(['api-old', 'web-old'])
  })

  test('generates smart prefix patterns', () => {
    const projectsToIgnore = [createMockProject('test-api'), createMockProject('test-web')]
    const allProjects = [
      createMockProject('test-api'),
      createMockProject('test-web'),
      createMockProject('production-api'),
    ]

    const results = generateIgnorePatterns(projectsToIgnore, allProjects, { mode: 'smart', verbose: false })

    expect(results).toHaveLength(1)
    expect(results[0].pattern).toBe('test-*')
    expect(results[0].type).toBe('prefix')
  })

  test('falls back to exact patterns when smart patterns too broad', () => {
    const projectsToIgnore = [createMockProject('api-old'), createMockProject('web-old')]
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('db-old'), // This makes *-old too broad
    ]

    const results = generateIgnorePatterns(projectsToIgnore, allProjects, { mode: 'smart', verbose: false })

    // Should fall back to exact patterns
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.pattern).sort()).toEqual(['api-old', 'web-old'])
  })

  test('exact mode returns exact project names', () => {
    const projectsToIgnore = [createMockProject('api-old'), createMockProject('web-old')]
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('current-api'),
    ]

    const results = generateIgnorePatterns(projectsToIgnore, allProjects, { mode: 'exact', verbose: false })

    expect(results).toHaveLength(2)
    expect(results.every((r) => r.type === 'exact')).toBe(true)
    expect(results.map((r) => r.pattern).sort()).toEqual(['api-old', 'web-old'])
  })

  test('handles empty input', () => {
    const results = generateIgnorePatterns([], [], { mode: 'smart', verbose: false })
    expect(results).toEqual([])
  })

  test('combines multiple pattern types', () => {
    const projectsToIgnore = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('test-service'),
      createMockProject('test-worker'),
      createMockProject('random-project'),
    ]
    const allProjects = [...projectsToIgnore, createMockProject('current-api')]

    const results = generateIgnorePatterns(projectsToIgnore, allProjects, { mode: 'smart', verbose: false })

    // Should have *-old, test-*, and random-project
    expect(results.length).toBeGreaterThanOrEqual(3)
    expect(results.some((r) => r.pattern === '*-old')).toBe(true)
    expect(results.some((r) => r.pattern === 'test-*')).toBe(true)
    expect(results.some((r) => r.pattern === 'random-project')).toBe(true)
  })
})

describe('mergeIgnorePatterns', () => {
  test('merges new patterns with existing ones', () => {
    const currentPatterns = ['old-pattern']
    const newPatternResults = [{ pattern: 'new-pattern', matches: ['project'], type: 'exact' as const }]
    const projectsToUnignore: AnalyzedProject[] = []
    const allProjects = [createMockProject('project')]

    const merged = mergeIgnorePatterns(currentPatterns, newPatternResults, projectsToUnignore, allProjects)

    expect(merged).toContain('old-pattern')
    expect(merged).toContain('new-pattern')
  })

  test('removes patterns matching projects to unignore', () => {
    const currentPatterns = ['*-old', 'test-*']
    const newPatternResults: any[] = []
    const projectsToUnignore = [createMockProject('api-old')]
    const allProjects = [
      createMockProject('api-old'),
      createMockProject('web-old'),
      createMockProject('test-service'),
    ]

    const merged = mergeIgnorePatterns(currentPatterns, newPatternResults, projectsToUnignore, allProjects)

    // *-old should be removed because it matches api-old which we want to unignore
    expect(merged).not.toContain('*-old')
    // test-* should remain
    expect(merged).toContain('test-*')
  })

  test('deduplicates combined patterns', () => {
    const currentPatterns = ['*-old']
    const newPatternResults = [
      { pattern: '*-old', matches: ['api-old', 'web-old'], type: 'suffix' as const },
      { pattern: 'api-old', matches: ['api-old'], type: 'exact' as const },
    ]
    const projectsToUnignore: AnalyzedProject[] = []
    const allProjects = [createMockProject('api-old'), createMockProject('web-old')]

    const merged = mergeIgnorePatterns(currentPatterns, newPatternResults, projectsToUnignore, allProjects)

    // Should only have *-old, not the duplicate or the redundant api-old
    expect(merged).toContain('*-old')
    expect(merged.filter((p) => p === '*-old').length).toBe(1)
    expect(merged).not.toContain('api-old')
  })

  test('handles empty inputs', () => {
    const merged = mergeIgnorePatterns([], [], [], [])
    expect(merged).toEqual([])
  })
})
