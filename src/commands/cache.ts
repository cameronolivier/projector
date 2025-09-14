import { Command, Flags } from '@oclif/core'
import { CacheManager } from '../lib/cache/manager.js'
import * as fs from 'fs/promises'
import * as path from 'path'

export default class Cache extends Command {
  static override description = 'Manage project analysis cache for improved performance'

  static override examples = [
    {
      description: 'Show cache statistics and performance metrics',
      command: '<%= config.bin %> cache --stats',
    },
    {
      description: 'View cache directory location on disk',
      command: '<%= config.bin %> cache --location',
    },
    {
      description: 'Clear all cached project analysis data',
      command: '<%= config.bin %> cache --clear',
    },
    {
      description: 'Remove cache entries older than 7 days',
      command: '<%= config.bin %> cache --prune',
    },
    {
      description: 'Remove cache entries older than 24 hours',
      command: '<%= config.bin %> cache --prune --max-age 24',
    },
    {
      description: 'Show all cache information (default when no flags)',
      command: '<%= config.bin %> cache',
    },
  ]

  static override flags = {
    stats: Flags.boolean({
      char: 's',
      description: 'Display detailed cache statistics including size, hit rates, and session metrics',
    }),
    clear: Flags.boolean({
      char: 'c', 
      description: 'Delete all cached project analysis data. Use when projects have significantly changed',
    }),
    prune: Flags.boolean({
      char: 'p',
      description: 'Remove outdated cache entries based on age. Helps maintain cache performance',
    }),
    location: Flags.boolean({
      char: 'l',
      description: 'Show the full path to the cache directory on disk',
    }),
    'max-age': Flags.integer({
      description: 'Maximum age in hours for cache entries during prune operation. Default: 168 hours (7 days)',
      default: 24 * 7, // 7 days
      helpValue: '24',
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
      const cacheDir = path.join(configHome, 'projector', 'cache')
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
      const cacheDir = path.join(configHome, 'projector', 'cache')
      
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
