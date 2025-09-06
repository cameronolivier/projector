import { Command, Flags } from '@oclif/core'
import { CacheManager } from '../lib/cache/manager.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export default class Cache extends Command {
  static override description = 'Manage project analysis cache'

  static override examples = [
    '<%= config.bin %> cache --stats',
    '<%= config.bin %> cache --clear',
    '<%= config.bin %> cache --prune',
    '<%= config.bin %> cache --location',
  ]

  static override flags = {
    stats: Flags.boolean({
      char: 's',
      description: 'Show cache statistics and location',
    }),
    clear: Flags.boolean({
      char: 'c', 
      description: 'Clear all cached data',
    }),
    prune: Flags.boolean({
      char: 'p',
      description: 'Remove old cache entries (older than 7 days)',
    }),
    location: Flags.boolean({
      char: 'l',
      description: 'Show cache directory location',
    }),
    'max-age': Flags.integer({
      description: 'Maximum age in hours for prune operation',
      default: 24 * 7, // 7 days
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Cache)
    const cacheManager = new CacheManager()

    // If no flags specified, show stats by default
    if (!flags.stats && !flags.clear && !flags.prune && !flags.location) {
      flags.stats = true
    }

    if (flags.location) {
      const configHome = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME!, '.config')
      const cacheDir = path.join(configHome, 'projects', 'cache')
      this.log(`Cache directory: ${cacheDir}`)
    }

    if (flags.clear) {
      this.log('🗑️  Clearing all cached data...')
      await cacheManager.clearCache()
      this.log('✅ Cache cleared')
    }

    if (flags.prune) {
      this.log(`🧹 Pruning cache entries older than ${flags['max-age']} hours...`)
      const prunedCount = await cacheManager.pruneOldCache(flags['max-age'])
      this.log(`✅ Pruned ${prunedCount} old cache entries`)
    }

    if (flags.stats) {
      await this.showCacheStats(cacheManager)
    }
  }

  private async showCacheStats(cacheManager: CacheManager): Promise<void> {
    try {
      const configHome = process.env.XDG_CONFIG_HOME || path.join(process.env.HOME!, '.config')
      const cacheDir = path.join(configHome, 'projects', 'cache')
      
      let cacheSize = 0
      let fileCount = 0
      
      try {
        await cacheManager.ensureCacheDir()
        const files = await fs.readdir(cacheDir)
        
        for (const file of files) {
          if (file.endsWith('.json')) {
            fileCount++
            try {
              const stats = await fs.stat(path.join(cacheDir, file))
              cacheSize += stats.size
            } catch (error) {
              // File might have been deleted, ignore
            }
          }
        }
      } catch (error) {
        // Cache directory doesn't exist yet
      }

      this.log('\n📊 Cache Statistics')
      this.log('==================')
      this.log(`Location: ${cacheDir}`)
      this.log(`Cached projects: ${fileCount}`)
      this.log(`Cache size: ${this.formatBytes(cacheSize)}`)

      const stats = cacheManager.getStats()
      if (stats.totalProjects > 0) {
        this.log(`\nSession stats:`)
        this.log(`- Cache hits: ${stats.cacheHits}`)
        this.log(`- Cache misses: ${stats.cacheMisses}`)
        this.log(`- Invalidated: ${stats.invalidated}`)
        this.log(`- Hit rate: ${Math.round(stats.cacheHitRate * 100)}%`)
      }

    } catch (error) {
      this.error(`Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }
}
