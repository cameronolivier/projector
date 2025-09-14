import * as fs from 'fs/promises'
jest.mock('fs/promises', () => {
  let tree = new Map<string, { files: string[]; dirs: string[] }>()
  const api = {
    __esModule: true,
    __setMockTree: (t: Map<string, { files: string[]; dirs: string[] }>) => {
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
    stat: async () => ({ mtime: new Date() }),
    realpath: async (p: string) => p,
  }
  return api
})
import { ProjectScanner } from '../src/lib/discovery/scanner'
import { ProjectsConfig } from '../src/lib/types'

describe('ProjectScanner - stop at package.json root', () => {
  afterEach(() => {})

  it('returns only the directory containing package.json and does not descend further', async () => {
    // Simulated tree:
    // /root/apps
    // └── app
    //     ├── package.json
    //     └── packages
    //         └── lib
    //             └── package.json
    const tree = new Map<string, { files: string[]; dirs: string[] }>([
      ['/root/apps', { files: [], dirs: ['app'] }],
      ['/root/apps/app', { files: ['package.json'], dirs: ['packages'] }],
      ['/root/apps/app/packages', { files: [], dirs: ['lib'] }],
      ['/root/apps/app/packages/lib', { files: ['package.json'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)

    const config: Partial<ProjectsConfig> = { stopAtNodePackageRoot: true }
    const scanner = new ProjectScanner(config as ProjectsConfig)
    const projects = await scanner.scanDirectory('/root/apps', {
      maxDepth: 10,
      ignorePatterns: [],
      followSymlinks: false,
    })

    expect(projects.map((p) => p.path)).toEqual(['/root/apps/app'])
  })

  it('continues scanning when no package.json is present', async () => {
    const tree = new Map<string, { files: string[]; dirs: string[] }>([
      ['/root/scratch', { files: [], dirs: ['foo'] }],
      ['/root/scratch/foo', { files: ['index.ts'], dirs: [] }],
    ])
    ;(fs as any).__setMockTree(tree)

    const config: Partial<ProjectsConfig> = { stopAtNodePackageRoot: true }
    const scanner = new ProjectScanner(config as ProjectsConfig)
    const projects = await scanner.scanDirectory('/root/scratch', {
      maxDepth: 10,
      ignorePatterns: [],
      followSymlinks: false,
    })

    // Should discover /root/scratch/foo as a project (code file heuristic)
    expect(projects.map((p) => p.path)).toEqual(['/root/scratch/foo'])
  })
})
