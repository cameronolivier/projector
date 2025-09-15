import * as fs from 'fs/promises'
import { ProjectScanner } from '../src/lib/discovery/scanner'
import { ProjectsConfig } from '../src/lib/types'

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
  codeFileExtensions: ['.ts', '.js', '.py'],
  stopAtNodePackageRoot: true,
  rootMarkers: ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'],
  monorepoMarkers: ['pnpm-workspace.yaml', 'lerna.json'],
  lockfilesAsStrong: true,
  minCodeFilesToConsider: 3,
  stopAtVcsRoot: true,
  includeNestedPackages: 'when-monorepo',
  respectGitIgnore: false,
  denylistPaths: [],
  colorScheme: { header: '', phaseStatus: '', stableStatus: '', unknownStatus: '', projectName: '' },
}

describe('ProjectScanner monorepo and docs-first', () => {
  it('registers monorepo root and includes workspace packages when configured', async () => {
    const tree = new Map<string, any>([
      ['/mono', { files: ['package.json'], dirs: ['packages'], fileContents: { 'package.json': JSON.stringify({ name: 'mono', private: true, workspaces: ['packages/*'] }) } }],
      ['/mono/packages', { files: [], dirs: ['a', 'b'] }],
      ['/mono/packages/a', { files: ['package.json'], dirs: [] }],
      ['/mono/packages/b', { files: ['package.json'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const cfg = { ...baseConfig, includeNestedPackages: 'when-monorepo' as const }
    const scanner = new ProjectScanner(cfg)
    const projects = await scanner.scanDirectory('/mono', { maxDepth: 5, ignorePatterns: [], followSymlinks: false })
    const paths = projects.map((p) => p.path).sort()
    expect(paths).toEqual(['/mono', '/mono/packages/a', '/mono/packages/b'])
  })

  it('detects docs-first project as a root when no manifests', async () => {
    const tree = new Map<string, any>([
      ['/docs-only', { files: [], dirs: ['docs'] }],
      ['/docs-only/docs', { files: ['readme.md'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scanner = new ProjectScanner(baseConfig)
    const projects = await scanner.scanDirectory('/docs-only', { maxDepth: 3, ignorePatterns: [], followSymlinks: false })
    expect(projects.map((p) => p.path)).toEqual(['/docs-only'])
  })
})

