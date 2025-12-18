import { IgnoreMatcher } from '../src/lib/discovery/ignore-matcher'
import { ProjectDirectory, ProjectType } from '../src/lib/types'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('IgnoreMatcher', () => {
  describe('parseIgnoreFile', () => {
    it('should parse basic patterns', () => {
      const matcher = new IgnoreMatcher()
      const content = `
node_modules
dist
.git
      `.trim()

      const rules = matcher.parseIgnoreFile(content, '/test/.projectorignore')

      expect(rules).toHaveLength(3)
      expect(rules[0]).toMatchObject({ pattern: 'node_modules', type: 'basename', negated: false })
      expect(rules[1]).toMatchObject({ pattern: 'dist', type: 'basename', negated: false })
      expect(rules[2]).toMatchObject({ pattern: '.git', type: 'basename', negated: false })
    })

    it('should skip comments and empty lines', () => {
      const matcher = new IgnoreMatcher()
      const content = `
# This is a comment
node_modules

# Another comment
dist
      `.trim()

      const rules = matcher.parseIgnoreFile(content, '/test/.projectorignore')

      expect(rules).toHaveLength(2)
      expect(rules[0].pattern).toBe('node_modules')
      expect(rules[1].pattern).toBe('dist')
    })

    it('should parse negation patterns', () => {
      const matcher = new IgnoreMatcher()
      const content = `
*-backup
!important-backup
      `.trim()

      const rules = matcher.parseIgnoreFile(content, '/test/.projectorignore')

      expect(rules).toHaveLength(2)
      expect(rules[0]).toMatchObject({ pattern: '*-backup', negated: false })
      expect(rules[1]).toMatchObject({ pattern: 'important-backup', negated: true })
    })

    it('should detect glob patterns', () => {
      const matcher = new IgnoreMatcher()
      const content = `
*-backup
test-*
**/tmp/*
./vendor
      `.trim()

      const rules = matcher.parseIgnoreFile(content, '/test/.projectorignore')

      expect(rules).toHaveLength(4)
      expect(rules[0].type).toBe('glob') // *-backup
      expect(rules[1].type).toBe('glob') // test-*
      expect(rules[2].type).toBe('glob') // **/tmp/*
      expect(rules[3].type).toBe('glob') // ./vendor (path-based)
    })
  })

  describe('shouldIgnoreDirectory', () => {
    it('should ignore directories from config', () => {
      const matcher = new IgnoreMatcher({
        directories: ['node_modules', 'dist'],
        patterns: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
      })

      expect(matcher.shouldIgnoreDirectory('/path/to/node_modules', 'node_modules')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/dist', 'dist')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/src', 'src')).toBe(false)
    })

    it('should support glob patterns in config', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['*-backup', 'tmp-*'],
        directories: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
      })

      expect(matcher.shouldIgnoreDirectory('/path/to/project-backup', 'project-backup')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/tmp-old', 'tmp-old')).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/path/to/my-project', 'my-project')).toBe(false)
    })

    it('should respect negation patterns', () => {
      const matcher = new IgnoreMatcher()
      const context = {
        rules: [
          { pattern: '*-backup', type: 'glob' as const, negated: false, source: 'config' },
          { pattern: 'important-backup', type: 'basename' as const, negated: true, source: 'config' },
        ],
        directory: '/test',
      }

      expect(matcher.shouldIgnoreDirectory('/test/project-backup', 'project-backup', context)).toBe(true)
      expect(matcher.shouldIgnoreDirectory('/test/important-backup', 'important-backup', context)).toBe(false)
    })
  })

  describe('shouldIgnoreProject', () => {
    it('should filter projects by name pattern', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['*-old', '*-backup'],
        directories: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
      })

      const project: ProjectDirectory = {
        name: 'my-project-old',
        path: '/path/to/my-project-old',
        type: ProjectType.NodeJS,
        languages: ['typescript'],
        hasGit: true,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project)).toBe(true)
    })

    it('should not filter projects that do not match', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['*-old'],
        directories: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
      })

      const project: ProjectDirectory = {
        name: 'my-active-project',
        path: '/path/to/my-active-project',
        type: ProjectType.NodeJS,
        languages: ['typescript'],
        hasGit: true,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project)).toBe(false)
    })

    it('should filter projects by path pattern', () => {
      const matcher = new IgnoreMatcher({
        patterns: ['**/archive/*'],
        directories: [],
        useIgnoreFiles: false,
        ignoreFileName: '.projectorignore',
      })

      const project: ProjectDirectory = {
        name: 'old-project',
        path: '/path/to/archive/old-project',
        type: ProjectType.NodeJS,
        languages: ['typescript'],
        hasGit: true,
        files: [],
        lastModified: new Date(),
      }

      expect(matcher.shouldIgnoreProject(project)).toBe(true)
    })
  })

  describe('loadIgnoreFile and buildContext', () => {
    let tmpDir: string

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projector-test-'))
    })

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true })
    })

    it('should load .projectorignore file', async () => {
      const matcher = new IgnoreMatcher({
        patterns: [],
        directories: [],
        useIgnoreFiles: true,
        ignoreFileName: '.projectorignore',
      })

      const ignoreContent = `
node_modules
dist
*-backup
      `.trim()

      await fs.writeFile(path.join(tmpDir, '.projectorignore'), ignoreContent)

      const rules = await matcher.loadIgnoreFile(tmpDir)

      expect(rules).toHaveLength(3)
      expect(rules[0].pattern).toBe('node_modules')
      expect(rules[1].pattern).toBe('dist')
      expect(rules[2].pattern).toBe('*-backup')
    })

    it('should return empty rules when file does not exist', async () => {
      const matcher = new IgnoreMatcher({
        patterns: [],
        directories: [],
        useIgnoreFiles: true,
        ignoreFileName: '.projectorignore',
      })

      const rules = await matcher.loadIgnoreFile(tmpDir)

      expect(rules).toHaveLength(0)
    })

    it('should build cumulative context', async () => {
      const matcher = new IgnoreMatcher({
        patterns: [],
        directories: [],
        useIgnoreFiles: true,
        ignoreFileName: '.projectorignore',
      })

      const parentIgnoreContent = `
node_modules
dist
      `.trim()

      const childIgnoreContent = `
*-backup
      `.trim()

      await fs.writeFile(path.join(tmpDir, '.projectorignore'), parentIgnoreContent)

      const childDir = path.join(tmpDir, 'child')
      await fs.mkdir(childDir)
      await fs.writeFile(path.join(childDir, '.projectorignore'), childIgnoreContent)

      const parentContext = await matcher.buildContext(tmpDir)
      const childContext = await matcher.buildContext(childDir, parentContext)

      expect(parentContext.rules).toHaveLength(2)
      expect(childContext.rules).toHaveLength(1)
      expect(childContext.parent).toBe(parentContext)
    })

    it('should cache loaded ignore files', async () => {
      const matcher = new IgnoreMatcher({
        patterns: [],
        directories: [],
        useIgnoreFiles: true,
        ignoreFileName: '.projectorignore',
      })

      const ignoreContent = `
node_modules
      `.trim()

      await fs.writeFile(path.join(tmpDir, '.projectorignore'), ignoreContent)

      const rules1 = await matcher.loadIgnoreFile(tmpDir)
      const rules2 = await matcher.loadIgnoreFile(tmpDir)

      expect(rules1).toBe(rules2) // Same reference (cached)
    })
  })
})
