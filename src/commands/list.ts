import { Command, Flags } from '@oclif/core'
import { ProjectScanner } from '../lib/discovery/scanner.js'
import { TypeDetector } from '../lib/discovery/detector.js'
import { TrackingAnalyzer } from '../lib/tracking/analyzer.js'
import { TableGenerator } from '../lib/output/table.js'
import { ConfigurationManager } from '../lib/config/config.js'
import { CacheManager } from '../lib/cache/manager.js'

export default class List extends Command {
  static override description = 'List all development projects with their status and descriptions'

  static override examples = [
    '<%= config.bin %> list',
    '<%= config.bin %> list --depth 3',
    '<%= config.bin %> list --directory ~/code',
  ]

  static override flags = {
    directory: Flags.string({
      char: 'd',
      description: 'Directory to scan for projects',
    }),
    depth: Flags.integer({
      description: 'Maximum depth to scan',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Verbose output with additional details',
    }),
    'no-cache': Flags.boolean({
      description: 'Skip cache and force fresh analysis of all projects',
      default: false,
    }),
    'clear-cache': Flags.boolean({
      description: 'Clear all cached data before scanning',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(List)
    
    try {
      // Load configuration
      const configManager = new ConfigurationManager()
      const config = await configManager.loadConfig()
      
      // Debug: show config being loaded
      if (flags.verbose) {
        this.log(`Config loaded: scanDirectory=${config.scanDirectory}, maxDepth=${config.maxDepth}`)
        this.log(`Flags: directory=${flags.directory}, depth=${flags.depth}`)
      }
      
      // Override with command line flags
      const scanDirectory = flags.directory || config.scanDirectory
      const maxDepth = flags.depth || config.maxDepth
      
      this.log(`🔍 Scanning projects in ${scanDirectory}...`)
      
      // Initialize components
      const scanner = new ProjectScanner()
      const detector = new TypeDetector()
      const analyzer = new TrackingAnalyzer(config.trackingPatterns)
      const tableGenerator = new TableGenerator()
      const cacheManager = new CacheManager()
      
      // Handle cache clearing
      if (flags['clear-cache']) {
        this.log('🗑️  Clearing cache...')
        await cacheManager.clearCache()
      }
      
      // Discover projects
      const directories = await scanner.scanDirectory(scanDirectory, {
        maxDepth,
        ignorePatterns: config.ignorePatterns,
        followSymlinks: false,
      })
      
      if (directories.length === 0) {
        this.log(`No projects found in ${scanDirectory}`)
        return
      }
      
      // Analyze each project with caching
      const projects = []
      const totalCount = directories.length
      let processedCount = 0
      
      for (const directory of directories) {
        processedCount++
        const progress = `(${processedCount}/${totalCount})`
        
        // Try to get from cache first (unless disabled)
        let cachedData = null
        if (!flags['no-cache']) {
          cachedData = await cacheManager.getCachedProject(directory)
        }
        
        if (cachedData) {
          // Use cached data
          if (flags.verbose) {
            this.log(`📋 Using cached data for ${directory.name} ${progress}`)
          }
          
          projects.push({
            ...directory,
            type: detector.detectProjectType(directory), // Detect type since we don't cache it
            languages: cachedData.languages,
            hasGit: cachedData.hasGit,
            status: cachedData.status,
            description: cachedData.description,
            trackingFiles: [],
            confidence: cachedData.status.confidence,
          })
          
        } else {
          // Fresh analysis
          if (flags.verbose || totalCount > 5) {
            this.log(`🔍 Analyzing ${directory.name} ${progress}`)
          }
          
          // Detect project type
          const projectType = detector.detectProjectType(directory)
          const languages = detector.detectLanguages(directory)
          const hasGit = detector.hasGitRepository(directory)
          
          // Analyze tracking status
          const status = await analyzer.analyzeProject(directory)
          const trackingFiles = await analyzer.detectTrackingFiles(directory)
          
          // Extract description from various sources
          let description = config.descriptions[directory.name] || 'No description available'
          
          // Try to get description from tracking files if available
          for (const trackingFile of trackingFiles) {
            if (trackingFile.content.description) {
              description = trackingFile.content.description
              break
            }
          }
          
          // Cache the results for next time
          if (!flags['no-cache']) {
            await cacheManager.setCachedProject(
              directory,
              status,
              description,
              trackingFiles,
              languages,
              hasGit
            )
          }
          
          projects.push({
            ...directory,
            type: projectType,
            languages,
            hasGit,
            status,
            description,
            trackingFiles: [],
            confidence: status.confidence,
          })
        }
      }
      
      // Sort projects by name
      projects.sort((a, b) => a.name.localeCompare(b.name))
      
      // Generate and display table
      const table = tableGenerator.generateTable(projects)
      this.log(table)
      
      // Display summary with cache stats
      const withTracking = projects.filter(p => p.status.type !== 'unknown').length
      const total = projects.length
      const cacheStats = cacheManager.getStats()
      
      this.log(`\nFound ${total} projects (${withTracking} with tracking, ${total - withTracking} unknown)`)
      
      if (flags.verbose && cacheStats.totalProjects > 0) {
        this.log(`Cache: ${cacheStats.cacheHits} hits, ${cacheStats.cacheMisses} misses, ${cacheStats.invalidated} invalidated (${Math.round(cacheStats.cacheHitRate * 100)}% hit rate)`)
      }
      
    } catch (error) {
      this.error(`Failed to scan projects: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
