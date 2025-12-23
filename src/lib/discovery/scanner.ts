import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectDirectory, ScanOptions, ProjectType, ProjectsConfig } from '../types.js'
import { RootSignalScorer } from './root-scorer.js'
import { IgnoreMatcher } from './ignore-matcher.js'

export class ProjectScanner {
  private config?: ProjectsConfig
  private ignoreMatcher: IgnoreMatcher

  constructor(config?: ProjectsConfig) {
    this.config = config
    this.ignoreMatcher = new IgnoreMatcher(config?.ignore)
  }
  async scanDirectory(basePath: string, options: ScanOptions): Promise<ProjectDirectory[]> {
    try {
      const projects: ProjectDirectory[] = []
      const visitedPaths = new Set<string>()
      const projectRoots = new Set<string>()
      
      // Use direct filesystem traversal instead of glob for better performance
      await this.scanDirectoryRecursive(
        basePath,
        0,
        options.maxDepth,
        options.ignorePatterns,
        projects,
        visitedPaths,
        projectRoots,
        false
      )

      return projects
    } catch (error) {
      throw new Error(`Failed to scan directory ${basePath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  private async scanDirectoryRecursive(
    currentPath: string,
    currentDepth: number,
    maxDepth: number,
    ignorePatterns: string[],
    projects: ProjectDirectory[],
    visitedPaths: Set<string>,
    projectRoots: Set<string>,
    allowInsideRoots: boolean = false
  ): Promise<void> {
    // Check depth limit
    if (currentDepth >= maxDepth) {
      return
    }
    
    // Skip ignored directories (legacy)
    if (this.shouldIgnoreDirectory(currentPath, ignorePatterns)) {
      return
    }

    // Check config-based ignore patterns
    if (this.config?.ignore) {
      const basename = path.basename(currentPath)
      if (this.ignoreMatcher.shouldIgnoreDirectory(currentPath, basename)) {
        return
      }
    }

    // Skip if inside an already identified project root
    if (!allowInsideRoots) {
      if (Array.from(projectRoots).some(root => currentPath.startsWith(root + path.sep))) {
        return
      }
    }
    
    try {
      // Avoid processing symlinks multiple times
      const realPath = await fs.realpath(currentPath)
      if (visitedPaths.has(realPath)) {
        return
      }
      visitedPaths.add(realPath)

      const scorer = new RootSignalScorer(this.config as ProjectsConfig)
      const signals = await scorer.collectSignals(currentPath)

      // Denylist / path-based skip
      if ((this.config?.denylistPaths || []).some((p) => realPath.includes(p))) {
        return
      }

      // Stop at VCS root if configured and not at the base path yet
      if ((this.config?.stopAtVcsRoot ?? true) && signals.hasGit) {
        // Consider current directory as a root candidate as well
        const score = scorer.scoreSignals(signals)
        if (score >= 60) {
          const project = await this.createProjectDirectory(currentPath)
          projects.push(project)
          projectRoots.add(currentPath)
          return
        }
      }

      // Generalized early-stop for strong roots (including package.json)
      const score = scorer.scoreSignals(signals)
      if (score >= 60) {
        const project = await this.createProjectDirectory(currentPath)
        projects.push(project)
        projectRoots.add(currentPath)

        // If monorepo and config includes nested packages, traverse only workspace globs
        if ((this.config?.includeNestedPackages && this.config.includeNestedPackages !== 'never')) {
          const globs = await scorer.workspaceGlobs(currentPath, signals)
          if (globs.length > 0) {
            // Resolve simple globs like packages/* one level deep
            const targets = new Set<string>()
            for (const g of globs) {
              if (g.endsWith('/*')) {
                const base = g.slice(0, -2)
                const resolvedBase = path.join(currentPath, base)
                try {
                  const subEntries = await fs.readdir(resolvedBase, { withFileTypes: true })
                  for (const e of subEntries) {
                    if (e.isDirectory()) targets.add(path.join(resolvedBase, e.name))
                  }
                } catch {}
              } else {
                targets.add(path.join(currentPath, g))
              }
            }
            for (const t of Array.from(targets)) {
              await this.scanDirectoryRecursive(
                t,
                currentDepth + 1,
                maxDepth,
                ignorePatterns,
                projects,
                visitedPaths,
                projectRoots,
                true
              )
            }
          }
        }
        // Regardless, we do not continue generic descent from strong roots
        return
      }

      // Check if this directory is a project
      const isProject = await this.isProjectDirectory(currentPath)
      if (isProject) {
        const project = await this.createProjectDirectory(currentPath)
        projects.push(project)
        projectRoots.add(currentPath)
        // Don't scan subdirectories of project roots
        return
      }
      
      // Recursively scan subdirectories
      const entries = await fs.readdir(currentPath, { withFileTypes: true })
      const subdirectories = entries
        .filter(entry => entry.isDirectory())
        .map(entry => path.join(currentPath, entry.name))
      
      // Process directories in parallel but limit concurrency
      const concurrencyLimit = 5
      for (let i = 0; i < subdirectories.length; i += concurrencyLimit) {
        const batch = subdirectories.slice(i, i + concurrencyLimit)
        await Promise.allSettled(
          batch.map(subdir =>
            this.scanDirectoryRecursive(
              subdir,
              currentDepth + 1,
              maxDepth,
              ignorePatterns,
              projects,
              visitedPaths,
              projectRoots,
              false
            )
          )
        )
      }
      
    } catch (error) {
      // Skip directories we can't access
      return
    }
  }

  async isProjectDirectory(dirPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true })
      const fileNames = files.map(f => f.name)
      
      // Strong project indicators (manifest files) - these are definitive project roots
      const strongIndicators = [
        'package.json',      // Node.js
        'Cargo.toml',        // Rust
        'go.mod',            // Go
        'requirements.txt',  // Python
        'setup.py',          // Python
        'pyproject.toml',    // Python
        'composer.json',     // PHP
        'pom.xml',           // Java Maven
        'build.gradle',      // Java Gradle
        'Makefile',          // C/C++/Make
        'CMakeLists.txt',    // CMake
        '.git',              // Git repository
      ]
      
      // If we find a strong indicator, this is definitely a project root
      if (strongIndicators.some(indicator => fileNames.includes(indicator))) {
        return true
      }
      
      // Code file extensions that indicate a project root (from config or defaults)
      const codeFileExtensions = this.config?.codeFileExtensions || [
        '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // TypeScript/JavaScript
        '.py', '.pyx', '.pyi',                         // Python
        '.php', '.phtml',                              // PHP
        '.go',                                         // Go
        '.rs',                                         // Rust
        '.java', '.kt', '.kts',                        // Java/Kotlin
        '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',     // C/C++
        '.cs',                                         // C#
        '.rb',                                         // Ruby
        '.swift',                                      // Swift
        '.dart',                                       // Dart
        '.vue',                                        // Vue
        '.svelte',                                     // Svelte
        '.html', '.htm',                               // HTML
        '.css', '.scss', '.sass', '.less',             // CSS
        '.sh', '.bash', '.zsh', '.fish',               // Shell scripts
        '.ps1', '.psm1',                               // PowerShell
        '.bat', '.cmd',                                // Windows batch
      ]
      
      // Check if any files have code extensions
      const hasCodeFiles = fileNames.some(fileName => {
        const ext = path.extname(fileName).toLowerCase()
        return codeFileExtensions.includes(ext)
      })
      
      return hasCodeFiles
      
    } catch (error) {
      // If we can't read the directory, assume it's not a project
      return false
    }
  }

  shouldIgnoreDirectory(dirPath: string, additionalIgnorePatterns?: string[]): boolean {
    const dirname = path.basename(dirPath)
    const fullPath = path.normalize(dirPath)
    
    // Combine default and additional ignore patterns
    const defaultIgnorePatterns = [
      'node_modules',
      '.git',
      '.svn',
      '.hg',
      'dist',
      'build',
      'target',      // Rust/Java
      '__pycache__', // Python
      '.pytest_cache',
      '.venv',
      'venv',
      '.env',
      'tmp',
      'temp',
      'logs',
      '.DS_Store',
      '.vscode',
      '.idea',
    ]
    
    const allIgnorePatterns = [...defaultIgnorePatterns, ...(additionalIgnorePatterns || [])]

    // Check if directory name matches ignore patterns
    if (allIgnorePatterns.includes(dirname) || dirname.startsWith('.')) {
      return true
    }

    // Check if any part of the path contains ignored directories
    const pathParts = fullPath.split(path.sep)
    for (const part of pathParts) {
      if (allIgnorePatterns.includes(part)) {
        return true
      }
    }

    return false
  }


  private async createProjectDirectory(dirPath: string): Promise<ProjectDirectory> {
    const name = path.basename(dirPath)
    const stats = await fs.stat(dirPath)
    const files = await this.getDirectoryFiles(dirPath)

    return {
      name,
      path: dirPath,
      type: ProjectType.Unknown, // Will be determined by TypeDetector
      languages: [],
      hasGit: false,
      files,
      lastModified: stats.mtime,
    }
  }

  private async getDirectoryFiles(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath)
    } catch (error) {
      return []
    }
  }

  private async hasFile(dirPath: string, fileName: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath)
      return entries.includes(fileName)
    } catch {
      return false
    }
  }
}
