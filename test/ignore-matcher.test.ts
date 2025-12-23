import { IgnoreMatcher } from '../src/lib/discovery/ignore-matcher'
import { ProjectDirectory, ProjectType } from '../src/lib/types'

describe('IgnoreMatcher', () => {
  describe('shouldIgnoreDirectory', () => {
    it('should ignore directories from config', () => {
      const matcher = new IgnoreMatcher({
        directories: ['node_modules', 'dist'],
        patterns: [],
      })

      expect(matcher.shouldIgnoreDirectory('/path/to/node_modules', 'node_modules')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/dist', 'dist')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/src', 'src')).toBe(false)
    })

    it('should support glob patterns in config', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['*-backup', 'tmp-*'],
        directories: [],
      })

      expect(matcher.shouldIgnoreDirectory('/path/to/project-backup', 'project-backup')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/tmp-old', 'tmp-old')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/my-project', 'my-project')).toBe(false)
    })

    it('should match patterns against directory path', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['**/archive/**'],
        directories: [],
      })

      expect(matcher.shouldIgnoreDirectory('/projects/archive/old', 'old')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/projects/active/new', 'new')).toBe(false)
    })
  })

  describe('shouldIgnoreProject', () => {
    it('should ignore projects by exact name', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['old-project', 'deprecated-app'],
        directories: [],
      })

      const project1: ProjectDirectory = {
        name: 'old-project',
        path: '/test/old-project',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      const project2: ProjectDirectory = {
        name: 'new-project',
        path: '/test/new-project',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project1)).toBe(true)
      expect(matcher.shouldIgnoreProject(project2)).toBe(false)
    })

    it('should support glob patterns for project names', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['test-*', '*-backup'],
        directories: [],
      })

      const project1: ProjectDirectory = {
        name: 'test-app',
        path: '/test/test-app',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      const project2: ProjectDirectory = {
        name: 'important-backup',
        path: '/test/important-backup',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      const project3: ProjectDirectory = {
        name: 'production-app',
        path: '/test/production-app',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project1)).toBe(true)
      expect(matcher.shouldIgnoreProject(project2)).toBe(true)
      expect(matcher.shouldIgnoreProject(project3)).toBe(false)
    })

    it('should match against project path', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['**/archive/**'],
        directories: [],
      })

      const project1: ProjectDirectory = {
        name: 'old-app',
        path: '/projects/archive/old-app',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      const project2: ProjectDirectory = {
        name: 'new-app',
        path: '/projects/active/new-app',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project1)).toBe(true)
      expect(matcher.shouldIgnoreProject(project2)).toBe(false)
    })

    it('should handle empty config', () => {
      const matcher = new IgnoreMatcher({
        patterns: [],
        directories: [],
      })

      const project: ProjectDirectory = {
        name: 'any-project',
        path: '/test/any-project',
        type: ProjectType.NodeJS,
        languages: [],
        hasGit: false,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project)).toBe(false)
    })
  })
})
