import * as fs from 'fs/promises'
import { RootSignalScorer } from '../src/lib/discovery/root-scorer'
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
      // simplistic
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

describe('RootSignalScorer', () => {
  it('scores manifests strongly and docs-first moderately', async () => {
    const tree = new Map<string, any>([
      ['/p1', { files: ['package.json'], dirs: [] }],
      ['/p2', { files: [], dirs: ['docs'], fileContents: {} }],
      ['/p2/docs', { files: ['plan.md'], dirs: [], fileContents: {} }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scorer = new RootSignalScorer(baseConfig)
    const s1 = await scorer.collectSignals('/p1')
    const s2 = await scorer.collectSignals('/p2')
    expect(s1.hasManifest).toBe(true)
    expect(scorer.scoreSignals(s1)).toBeGreaterThanOrEqual(100)
    expect(s2.hasDocsFirst).toBe(true)
    expect(scorer.scoreSignals(s2)).toBeGreaterThanOrEqual(50)
  })

  it('parses pnpm-workspace globs from yaml', async () => {
    const tree = new Map<string, any>([
      ['/mono', { files: ['pnpm-workspace.yaml'], dirs: ['packages'], fileContents: { 'pnpm-workspace.yaml': 'packages:\n  - \'packages/*\'\n' } }],
      ['/mono/packages', { files: [], dirs: ['a', 'b'] }],
    ])
    ;(fs as any).__setMockTree(tree)
    const scorer = new RootSignalScorer(baseConfig)
    const signals = await scorer.collectSignals('/mono')
    const globs = await scorer.workspaceGlobs('/mono', signals)
    expect(globs).toContain('packages/*')
  })
})

