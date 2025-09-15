import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectsConfig } from '../types.js'
import { parse as parseYaml } from 'yaml'

export interface RootSignals {
  files: string[]
  dirs: string[]
  hasGit: boolean
  hasManifest: boolean
  manifests: string[]
  lockfiles: string[]
  monorepoMarkers: string[]
  hasDocsFirst: boolean
}

export class RootSignalScorer {
  constructor(private config: ProjectsConfig) {}

  async collectSignals(dir: string): Promise<RootSignals> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      const files = entries.filter((e) => !e.isDirectory()).map((e) => e.name)
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)

      const hasGit = dirs.includes('.git') || files.includes('.git')

      const manifestCandidates = new Set([
        ...(this.config.rootMarkers || []),
      ])
      const lockfileCandidates = new Set([
        'package-lock.json',
        'yarn.lock',
        'pnpm-lock.yaml',
        'poetry.lock',
        'Pipfile.lock',
        'Cargo.lock',
        'composer.lock',
      ])
      const monorepoCandidates = new Set([
        ...(this.config.monorepoMarkers || []),
      ])

      const manifests = files.filter((f) => manifestCandidates.has(f))
      const lockfiles = files.filter((f) => lockfileCandidates.has(f))
      const monorepoMarkers = files.filter((f) => monorepoCandidates.has(f))

      // docs-first: a docs/ directory with at least one markdown file
      let hasDocsFirst = false
      if (dirs.includes('docs')) {
        try {
          const docsDir = path.join(dir, 'docs')
          const docsFiles = await fs.readdir(docsDir)
          hasDocsFirst = docsFiles.some((f) => /\.(md|mdx)$/i.test(f))
        } catch {}
      }

      return {
        files,
        dirs,
        hasGit,
        hasManifest: manifests.length > 0,
        manifests,
        lockfiles,
        monorepoMarkers,
        hasDocsFirst,
      }
    } catch {
      return {
        files: [],
        dirs: [],
        hasGit: false,
        hasManifest: false,
        manifests: [],
        lockfiles: [],
        monorepoMarkers: [],
        hasDocsFirst: false,
      }
    }
  }

  scoreSignals(signals: RootSignals): number {
    let score = 0
    // Strong markers
    if (signals.hasManifest) score += 100
    if (signals.lockfiles.length > 0 && (this.config.lockfilesAsStrong ?? true)) score += 60
    if (signals.monorepoMarkers.length > 0) score += 100
    // VCS with manifest is strong; VCS alone medium if configured to stop at VCS root
    if (signals.hasGit && signals.hasManifest) score += 50
    if (signals.hasGit && (this.config.stopAtVcsRoot ?? true)) score += 30

    // Medium signals
    if (signals.hasDocsFirst) score += 60
    const hasStructure = signals.dirs.some((d) => ['src', 'app', 'lib', 'tests', 'test'].includes(d))
    if (hasStructure) score += 40

    // Weak code file threshold
    const minCode = this.config.minCodeFilesToConsider ?? 5
    const exts = new Set(this.config.codeFileExtensions || [])
    const codeCount = signals.files.filter((f) => exts.has(path.extname(f).toLowerCase())).length
    if (codeCount >= minCode) score += 30

    // Negative signals
    const negativeDirs = ['node_modules', 'vendor', 'Pods', '.gradle', '.terraform', '.m2', 'dist', 'build', 'coverage', '.nyc_output', '.cache', '.next', '.parcel-cache', 'out', 'bin']
    const exampleDirs = ['examples', 'fixtures', 'samples']
    const onlyNegative = signals.dirs.length > 0 && signals.dirs.every((d) => negativeDirs.includes(d) || exampleDirs.includes(d))
    if (onlyNegative) score -= 50

    return score
  }

  isMonorepoRoot(signals: RootSignals, dir: string): boolean {
    // Simplistic: presence of known markers or package.json with workspaces
    if (signals.monorepoMarkers.length > 0) return true
    if (signals.manifests.includes('package.json')) {
      // Check workspaces field
      // Note: read synchronously via fs.readFile async
      // This method is async-unfriendly; we’ll just do a quick check in workspaceGlobs
    }
    return false
  }

  async workspaceGlobs(dir: string, signals: RootSignals): Promise<string[]> {
    const globs: string[] = []
    try {
      if (signals.files.includes('pnpm-workspace.yaml')) {
        const content = await fs.readFile(path.join(dir, 'pnpm-workspace.yaml'), 'utf8')
        const data = parseYaml(content) as any
        if (data && Array.isArray(data.packages)) {
          globs.push(...data.packages)
        }
      }
    } catch {}
    try {
      if (signals.files.includes('lerna.json')) {
        const content = await fs.readFile(path.join(dir, 'lerna.json'), 'utf8')
        const json = JSON.parse(content)
        if (json && Array.isArray(json.packages)) {
          globs.push(...json.packages)
        }
      }
    } catch {}
    try {
      if (signals.files.includes('package.json')) {
        const content = await fs.readFile(path.join(dir, 'package.json'), 'utf8')
        const pkg = JSON.parse(content)
        if (pkg && pkg.workspaces) {
          if (Array.isArray(pkg.workspaces)) globs.push(...pkg.workspaces)
          else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) globs.push(...pkg.workspaces.packages)
        }
      }
    } catch {}
    return globs
  }
}
