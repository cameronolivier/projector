import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { CachedGitInsights, ProjectDirectory, ProjectStatus, TrackingFile } from '../types.js'

export interface CachedProjectData {
  projectPath: string
  name: string
  lastModified: number
  directoryModified: number
  status: ProjectStatus
  description: string
  trackingFiles: {
    path: string
    type: string
    lastModified: number
  }[]
  languages: string[]
  hasGit: boolean
  cachedAt: number
  git?: CachedGitInsights
}

export interface CacheStats {
  totalProjects: number
  cacheHits: number
  cacheMisses: number
  invalidated: number
  cacheHitRate: number
}

export class CacheManager {
  private cacheDir: string
  private stats: CacheStats = {
    totalProjects: 0,
    cacheHits: 0,
    cacheMisses: 0,
    invalidated: 0,
    cacheHitRate: 0
  }

  constructor() {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    this.cacheDir = path.join(configHome, 'projector', 'cache')
  }

  async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true })
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error
      }
    }
  }

  private getCacheFilePath(projectPath: string): string {
    // Create a safe filename from the project path
    const hash = crypto.createHash('md5').update(projectPath).digest('hex')
    const safeName = path.basename(projectPath).replace(/[^a-zA-Z0-9.-]/g, '_')
    return path.join(this.cacheDir, `${safeName}_${hash}.json`)
  }

  async getCachedProject(directory: ProjectDirectory): Promise<CachedProjectData | null> {
    try {
      await this.ensureCacheDir()
      const cacheFile = this.getCacheFilePath(directory.path)
      
      const exists = await this.fileExists(cacheFile)
      if (!exists) {
        this.stats.cacheMisses++
        return null
      }

      const cacheContent = await fs.readFile(cacheFile, 'utf-8')
      const cached: CachedProjectData = JSON.parse(cacheContent)
      
      // Check if cache is still valid
      const isValid = await this.isCacheValid(cached, directory)
      
      if (!isValid) {
        this.stats.invalidated++
        // Clean up invalid cache
        await fs.unlink(cacheFile).catch(() => {}) // Ignore errors
        return null
      }

      this.stats.cacheHits++
      return cached

    } catch (error) {
      this.stats.cacheMisses++
      return null
    }
  }

  async setCachedProject(
    directory: ProjectDirectory,
    status: ProjectStatus,
    description: string,
    trackingFiles: TrackingFile[],
    languages: string[],
    hasGit: boolean,
    git?: CachedGitInsights
  ): Promise<void> {
    try {
      await this.ensureCacheDir()
      const cacheFile = this.getCacheFilePath(directory.path)
      
      // Get directory modification time
      const dirStats = await fs.stat(directory.path)
      
      const cached: CachedProjectData = {
        projectPath: directory.path,
        name: directory.name,
        lastModified: Date.now(),
        directoryModified: dirStats.mtime.getTime(),
        status,
        description,
        trackingFiles: trackingFiles.map(tf => ({
          path: tf.path,
          type: tf.type,
          lastModified: tf.lastModified.getTime()
        })),
        languages,
        hasGit,
        cachedAt: Date.now(),
        git
      }

      await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2), 'utf-8')
      
    } catch (error) {
      // Cache write failure shouldn't break the application
      console.warn(`Failed to cache project ${directory.name}: ${error}`)
    }
  }

  async updateGitInsights(directory: ProjectDirectory, git: CachedGitInsights): Promise<void> {
    try {
      await this.ensureCacheDir()
      const cacheFile = this.getCacheFilePath(directory.path)
      const content = await fs.readFile(cacheFile, 'utf-8')
      const cached: CachedProjectData = JSON.parse(content)
      cached.git = git
      await fs.writeFile(cacheFile, JSON.stringify(cached, null, 2), 'utf-8')
    } catch (error) {
      // Ignore update failures; cache will refresh on next full analysis
    }
  }

  private async isCacheValid(cached: CachedProjectData, directory: ProjectDirectory): Promise<boolean> {
    try {
      // Check if project directory still exists
      const dirStats = await fs.stat(directory.path)
      
      // Check if directory was modified since cache
      if (dirStats.mtime.getTime() > cached.directoryModified) {
        return false
      }

      // Check if any tracking files were modified
      for (const trackingFile of cached.trackingFiles) {
        try {
          const fileStats = await fs.stat(trackingFile.path)
          if (fileStats.mtime.getTime() > trackingFile.lastModified) {
            return false
          }
        } catch (error) {
          // File might have been deleted, cache is invalid
          return false
        }
      }

      // Check cache age - invalidate after 24 hours regardless
      const cacheAgeHours = (Date.now() - cached.cachedAt) / (1000 * 60 * 60)
      if (cacheAgeHours > 24) {
        return false
      }

      return true

    } catch (error) {
      // If we can't check, assume invalid
      return false
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async clearCache(): Promise<void> {
    try {
      const files = await fs.readdir(this.cacheDir)
      await Promise.all(
        files
          .filter(f => f.endsWith('.json'))
          .map(f => fs.unlink(path.join(this.cacheDir, f)).catch(() => {}))
      )
    } catch (error) {
      // Ignore errors if cache dir doesn't exist
    }
  }

  async pruneOldCache(maxAgeHours: number = 24 * 7): Promise<number> {
    try {
      await this.ensureCacheDir()
      const files = await fs.readdir(this.cacheDir)
      const maxAge = maxAgeHours * 60 * 60 * 1000
      let prunedCount = 0

      for (const file of files) {
        if (!file.endsWith('.json')) continue
        
        const filePath = path.join(this.cacheDir, file)
        try {
          const stats = await fs.stat(filePath)
          if (Date.now() - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath)
            prunedCount++
          }
        } catch (error) {
          // File might have been deleted, ignore
        }
      }

      return prunedCount
    } catch (error) {
      return 0
    }
  }

  getStats(): CacheStats {
    this.stats.totalProjects = this.stats.cacheHits + this.stats.cacheMisses
    this.stats.cacheHitRate = this.stats.totalProjects > 0 
      ? this.stats.cacheHits / this.stats.totalProjects 
      : 0
    return { ...this.stats }
  }

  resetStats(): void {
    this.stats = {
      totalProjects: 0,
      cacheHits: 0,
      cacheMisses: 0,
      invalidated: 0,
      cacheHitRate: 0
    }
  }
}
