import * as fs from 'fs/promises'
import { ProjectScanner } from '../src/lib/discovery/scanner'
import { ProjectsConfig } from '../src/lib/types'
import { DEFAULT_TAG_PALETTE } from '../src/lib/tags/palette'

jest.mock('fs/promises', () => {
  let tree = new Map<string, { files: string[]; dirs: string[]; fileContents?: Record<string, string> }>()
  const api = {
    __esModule: true,
    __setMockTree: (t: Map<string, { files: string[]; dirs: string[]; fileContents?: Record<string, string> }>) => {
      tree = t
    },
    readdir: async (p: string, opts?: any) => {
      const node = tree.get(p)
      if (!node) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      if (opts && opts.withFileTypes) {
        return [
          ...node.dirs.map((name) => ({ name, isDirectory: () => true })),
          ...node.files.map((name) => ({ name, isDirectory: () => false })),
        ]
      }
      return [...node.dirs, ...node.files]
    },
    readFile: async (p: string, _enc?: string) => {
      for (const [dir, node] of tree) {
        if (node.fileContents) {
          for (const [fname, content] of Object.entries(node.fileContents)) {
            if (p === dir + '/' + fname) return content
          }
        }
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    stat: async () => ({ mtime: new Date() }),
    realpath: async (p: string) => p,
  }
  return api
})

const baseConfig: ProjectsConfig = {
  scanDirectory: '/root',
  maxDepth: 10,
  trackingPatterns: [],
  descriptions: {},
  ignorePatterns: [],
  codeFileExtensions: ['.ts', '.js', '.py', '.rs', '.go', '.java', '.kt'],
  stopAtNodePackageRoot: true,
  rootMarkers: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'settings.gradle'],
  monorepoMarkers: ['pnpm-workspace.yaml', 'lerna.json', 'go.work'],
  lockfilesAsStrong: true,
  minCodeFilesToConsider: 3,
  stopAtVcsRoot: true,
  includeNestedPackages: 'when-monorepo',
  respectGitIgnore: false,
  denylistPaths: [],
  tags: { enabled: true, style: 'badge', maxLength: 12, colorPalette: DEFAULT_TAG_PALETTE },
  colorScheme: { header: '', phaseStatus: '', stableStatus: '', unknownStatus: '', projectName: '' },
}

describe('ProjectScanner non-JS monorepo traversal', () => {
  it('follows go.work use block entries', async () => {
    const tree = new Map<string, any>([
      [
        '/go',
        {
          files: ['go.work'],
          dirs: ['modA', 'modB'],
          fileContents: { 'go.work': 'go 1.22\nuse (\n  ./modA\n  ./modB\n)\n' },
        },
      ],
      ['/go/modA', { files: ['go.mod'], dirs: [] }],
      ['/go/modB', { files: ['go.mod'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scanner = new ProjectScanner(baseConfig)
    const projects = await scanner.scanDirectory('/go', { maxDepth: 5, ignorePatterns: [], followSymlinks: false })
    const paths = projects.map((p) => p.path).sort()
    expect(paths).toEqual(['/go', '/go/modA', '/go/modB'])
  })

  it('follows Cargo workspace members', async () => {
    const tree = new Map<string, any>([
      [
        '/cargo',
        {
          files: ['Cargo.toml'],
          dirs: ['crates'],
          fileContents: { 'Cargo.toml': '[workspace]\nmembers = [\n  "crates/*"\n]\n' },
        },
      ],
      ['/cargo/crates', { files: [], dirs: ['a', 'b'] }],
      ['/cargo/crates/a', { files: ['Cargo.toml'], dirs: [] }],
      ['/cargo/crates/b', { files: ['Cargo.toml'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scanner = new ProjectScanner(baseConfig)
    const projects = await scanner.scanDirectory('/cargo', { maxDepth: 5, ignorePatterns: [], followSymlinks: false })
    const paths = projects.map((p) => p.path).sort()
    expect(paths).toEqual(['/cargo', '/cargo/crates/a', '/cargo/crates/b'])
  })

  it('follows Maven modules from pom.xml', async () => {
    const tree = new Map<string, any>([
      [
        '/maven',
        {
          files: ['pom.xml'],
          dirs: ['module-a', 'module-b'],
          fileContents: { 'pom.xml': '<project>\n<modules>\n  <module>module-a</module>\n  <module>module-b</module>\n</modules>\n</project>' },
        },
      ],
      ['/maven/module-a', { files: ['pom.xml'], dirs: [] }],
      ['/maven/module-b', { files: ['pom.xml'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scanner = new ProjectScanner(baseConfig)
    const projects = await scanner.scanDirectory('/maven', { maxDepth: 5, ignorePatterns: [], followSymlinks: false })
    const paths = projects.map((p) => p.path).sort()
    expect(paths).toEqual(['/maven', '/maven/module-a', '/maven/module-b'])
  })

  it('follows Gradle includes from settings.gradle', async () => {
    const tree = new Map<string, any>([
      [
        '/gradle',
        {
          files: ['build.gradle', 'settings.gradle'],
          dirs: ['app', 'lib'],
          fileContents: { 'settings.gradle': "rootProject.name='root'\ninclude ':app', ':lib'\n" },
        },
      ],
      ['/gradle/app', { files: ['build.gradle'], dirs: [] }],
      ['/gradle/lib', { files: ['build.gradle'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scanner = new ProjectScanner(baseConfig)
    const projects = await scanner.scanDirectory('/gradle', { maxDepth: 5, ignorePatterns: [], followSymlinks: false })
    const paths = projects.map((p) => p.path).sort()
    expect(paths).toEqual(['/gradle', '/gradle/app', '/gradle/lib'])
  })
})
