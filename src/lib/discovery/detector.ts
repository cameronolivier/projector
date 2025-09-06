import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectDirectory, ProjectType } from '../types.js'

export class TypeDetector {
  detectProjectType(directory: ProjectDirectory): ProjectType {
    const { files } = directory

    // Node.js projects
    if (files.includes('package.json')) {
      return ProjectType.NodeJS
    }

    // Rust projects
    if (files.includes('Cargo.toml')) {
      return ProjectType.Rust
    }

    // Go projects
    if (files.includes('go.mod') || files.includes('go.sum')) {
      return ProjectType.Go
    }

    // Python projects
    if (files.includes('requirements.txt') || 
        files.includes('setup.py') || 
        files.includes('pyproject.toml') ||
        files.includes('Pipfile')) {
      return ProjectType.Python
    }

    // PHP projects
    if (files.includes('composer.json')) {
      return ProjectType.PHP
    }

    // Java projects
    if (files.includes('pom.xml') || 
        files.includes('build.gradle') || 
        files.includes('build.gradle.kts')) {
      return ProjectType.Java
    }

    return ProjectType.Unknown
  }

  detectLanguages(directory: ProjectDirectory): string[] {
    const languages: string[] = []
    const { files, path: dirPath } = directory

    // Primary language based on project type
    const primaryLanguage = this.getPrimaryLanguage(directory.type)
    if (primaryLanguage) {
      languages.push(primaryLanguage)
    }

    // Additional languages based on configuration files
    const languageIndicators: Record<string, string> = {
      'tsconfig.json': 'TypeScript',
      '.eslintrc.js': 'JavaScript',
      '.eslintrc.json': 'JavaScript',
      'webpack.config.js': 'JavaScript',
      'babel.config.js': 'JavaScript',
      'jest.config.js': 'JavaScript',
      'tailwind.config.js': 'JavaScript',
      'next.config.js': 'JavaScript',
      'nuxt.config.js': 'JavaScript',
      'vite.config.js': 'JavaScript',
      'rollup.config.js': 'JavaScript',
      'svelte.config.js': 'JavaScript',
      'astro.config.mjs': 'JavaScript',
    }

    for (const [file, language] of Object.entries(languageIndicators)) {
      if (files.includes(file) && !languages.includes(language)) {
        languages.push(language)
      }
    }

    return languages.length > 0 ? languages : ['Unknown']
  }

  hasGitRepository(directory: ProjectDirectory): boolean {
    return directory.files.includes('.git')
  }

  async getGitRemoteInfo(directory: ProjectDirectory): Promise<string | null> {
    if (!this.hasGitRepository(directory)) {
      return null
    }

    try {
      const gitConfigPath = path.join(directory.path, '.git', 'config')
      const content = await fs.readFile(gitConfigPath, 'utf-8')
      
      // Simple regex to extract remote origin URL
      const remoteMatch = content.match(/\[remote "origin"\]\s+url\s*=\s*(.+)/i)
      return remoteMatch ? remoteMatch[1].trim() : null
    } catch (error) {
      return null
    }
  }

  async hasRecentActivity(directory: ProjectDirectory, daysSince: number = 30): Promise<boolean> {
    const threshold = new Date()
    threshold.setDate(threshold.getDate() - daysSince)
    
    return directory.lastModified > threshold
  }

  private getPrimaryLanguage(projectType: ProjectType): string | null {
    const languageMap: Record<ProjectType, string> = {
      [ProjectType.NodeJS]: 'JavaScript',
      [ProjectType.Python]: 'Python',
      [ProjectType.Rust]: 'Rust',
      [ProjectType.Go]: 'Go',
      [ProjectType.PHP]: 'PHP',
      [ProjectType.Java]: 'Java',
      [ProjectType.Unknown]: 'Unknown',
    }

    return languageMap[projectType] || null
  }

  async getProjectVersion(directory: ProjectDirectory): Promise<string | null> {
    try {
      switch (directory.type) {
        case ProjectType.NodeJS:
          return await this.getNodeJSVersion(directory.path)
        case ProjectType.Rust:
          return await this.getRustVersion(directory.path)
        case ProjectType.Python:
          return await this.getPythonVersion(directory.path)
        case ProjectType.PHP:
          return await this.getPHPVersion(directory.path)
        case ProjectType.Java:
          return await this.getJavaVersion(directory.path)
        default:
          return null
      }
    } catch (error) {
      return null
    }
  }

  private async getNodeJSVersion(projectPath: string): Promise<string | null> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json')
      const content = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(content)
      return packageJson.version || null
    } catch (error) {
      return null
    }
  }

  private async getRustVersion(projectPath: string): Promise<string | null> {
    try {
      const cargoTomlPath = path.join(projectPath, 'Cargo.toml')
      const content = await fs.readFile(cargoTomlPath, 'utf-8')
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m)
      return versionMatch ? versionMatch[1] : null
    } catch (error) {
      return null
    }
  }

  private async getPythonVersion(projectPath: string): Promise<string | null> {
    // Try pyproject.toml first, then setup.py
    try {
      const pyprojectPath = path.join(projectPath, 'pyproject.toml')
      const content = await fs.readFile(pyprojectPath, 'utf-8')
      const versionMatch = content.match(/^version\s*=\s*"([^"]+)"/m)
      return versionMatch ? versionMatch[1] : null
    } catch (error) {
      // Try setup.py
      try {
        const setupPyPath = path.join(projectPath, 'setup.py')
        const content = await fs.readFile(setupPyPath, 'utf-8')
        const versionMatch = content.match(/version\s*=\s*["']([^"']+)["']/i)
        return versionMatch ? versionMatch[1] : null
      } catch (setupError) {
        return null
      }
    }
  }

  private async getPHPVersion(projectPath: string): Promise<string | null> {
    try {
      const composerJsonPath = path.join(projectPath, 'composer.json')
      const content = await fs.readFile(composerJsonPath, 'utf-8')
      const composerJson = JSON.parse(content)
      return composerJson.version || null
    } catch (error) {
      return null
    }
  }

  private async getJavaVersion(projectPath: string): Promise<string | null> {
    // Try Maven pom.xml first
    try {
      const pomPath = path.join(projectPath, 'pom.xml')
      const content = await fs.readFile(pomPath, 'utf-8')
      const versionMatch = content.match(/<version>([^<]+)<\/version>/)
      return versionMatch ? versionMatch[1] : null
    } catch (error) {
      // Try Gradle build.gradle
      try {
        const buildGradlePath = path.join(projectPath, 'build.gradle')
        const content = await fs.readFile(buildGradlePath, 'utf-8')
        const versionMatch = content.match(/version\s*[=:]\s*["']([^"']+)["']/)
        return versionMatch ? versionMatch[1] : null
      } catch (gradleError) {
        return null
      }
    }
  }
}
