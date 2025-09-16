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
    // Go workspaces (go.work)
    try {
      if (signals.files.includes('go.work')) {
        const content = await fs.readFile(path.join(dir, 'go.work'), 'utf8')
        // Remove comments
        const noComments = content
          .split('\n')
          .map((l) => l.replace(/\s*\/\/.*$/, ''))
          .join('\n')
        // Match use directives: either single-line `use ./path` or block `use (\n ./a\n ./b\n)`
        const blockMatch = noComments.match(/use\s*\(([^)]*)\)/m)
        if (blockMatch) {
          const lines = blockMatch[1]
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
          for (const l of lines) {
            // Only include local directories
            if (!/^\w+@/.test(l)) {
              globs.push(l.replace(/^\.\//, ''))
            }
          }
        }
        const singleUse = noComments.match(/\buse\s+([^\s]+)/)
        if (singleUse && singleUse[1]) {
          const p = singleUse[1]
          if (!/^\w+@/.test(p)) globs.push(p.replace(/^\.\//, ''))
        }
      }
    } catch {}
    // Cargo workspaces (Cargo.toml [workspace].members)
    try {
      if (signals.files.includes('Cargo.toml')) {
        const content = await fs.readFile(path.join(dir, 'Cargo.toml'), 'utf8')
        const wsIdx = content.indexOf('[workspace]')
        if (wsIdx !== -1) {
          const tail = content.slice(wsIdx)
          const membersMatch = tail.match(/members\s*=\s*\[([\s\S]*?)\]/m)
          if (membersMatch) {
            const arr = membersMatch[1]
            const re = /"([^"]+)"|'([^']+)'/g
            let m: RegExpExecArray | null
            while ((m = re.exec(arr))) {
              const v = (m[1] || m[2] || '').trim()
              if (v) globs.push(v)
            }
          }
        }
      }
    } catch {}
    // Maven multi-module (pom.xml <modules>)
    try {
      if (signals.files.includes('pom.xml')) {
        const content = await fs.readFile(path.join(dir, 'pom.xml'), 'utf8')
        const block = content.match(/<modules>[\s\S]*?<\/modules>/m)
        if (block) {
          const re = /<module>\s*([^<\s]+)\s*<\/module>/g
          let m: RegExpExecArray | null
          while ((m = re.exec(block[0]))) {
            const v = (m[1] || '').trim()
            if (v) globs.push(v)
          }
        }
      }
    } catch {}
    // Gradle settings (settings.gradle / settings.gradle.kts)
    try {
      const gradleFiles = ['settings.gradle', 'settings.gradle.kts']
      for (const gf of gradleFiles) {
        if (signals.files.includes(gf)) {
          const content = await fs.readFile(path.join(dir, gf), 'utf8')
          // Match include forms: include 'app', 'lib' OR include(':app', ':lib')
          const includeRe = /include\s*\(([^)]*)\)|include\s+([^\n]+)/g
          let m: RegExpExecArray | null
          while ((m = includeRe.exec(content))) {
            const args = (m[1] || m[2] || '')
            const parts = args
              .split(',')
              .map((s) => s.replace(/['"()\s]/g, ''))
              .filter((s) => s.length > 0)
            for (const p of parts) {
              // Convert Gradle path notation to directories (':app:lib' → 'app/lib')
              const clean = p.replace(/^:/, '').replace(/:/g, path.sep)
              if (clean) globs.push(clean)
            }
          }
        }
      }
    } catch {}
    return globs
  }
}
