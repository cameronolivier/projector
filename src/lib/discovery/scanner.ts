import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectDirectory, ScanOptions, ProjectType } from '../types.js'

export class ProjectScanner {
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
        projectRoots
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
    projectRoots: Set<string>
  ): Promise<void> {
    // Check depth limit
    if (currentDepth >= maxDepth) {
      return
    }
    
    // Skip ignored directories
    if (this.shouldIgnoreDirectory(currentPath, ignorePatterns)) {
      return
    }
    
    // Skip if inside an already identified project root
    if (Array.from(projectRoots).some(root => currentPath.startsWith(root + path.sep))) {
      return
    }
    
    try {
      // Avoid processing symlinks multiple times
      const realPath = await fs.realpath(currentPath)
      if (visitedPaths.has(realPath)) {
        return
      }
      visitedPaths.add(realPath)
      
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
              projectRoots
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
      const files = await fs.readdir(dirPath)
      
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
      if (strongIndicators.some(indicator => files.includes(indicator))) {
        return true
      }
      
      // Weak indicators - only consider these if no strong indicators found
      // and we're not too deep in the directory structure
      const weakIndicators = [
        'README.md',         // Documentation
        'src',               // Source directory
        'lib',               // Library directory
      ]
      
      // Only consider weak indicators for shallow directories to avoid false positives
      const depth = dirPath.split(path.sep).length
      const hasWeakIndicator = weakIndicators.some(indicator => files.includes(indicator))
      
      // Consider it a project only if it has weak indicators and isn't too nested
      return hasWeakIndicator && depth <= 4 // Adjust depth threshold as needed
      
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
}
