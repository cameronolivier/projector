import * as fs from 'fs/promises'
import * as path from 'path'
import { ProjectDirectory, ProjectStatus, TrackingPattern, TrackingFile, TrackingType, TrackingInfo, PhaseInfo } from '../types.js'

export class TrackingAnalyzer {
  constructor(private patterns: TrackingPattern[]) {}

  async analyzeProject(directory: ProjectDirectory): Promise<ProjectStatus> {
    try {
      const trackingFiles = await this.detectTrackingFiles(directory)
      
      if (trackingFiles.length === 0) {
        return {
          type: 'unknown',
          details: 'No tracking files found',
          confidence: 0.1,
        }
      }

      // Analyze each tracking file and determine overall status
      return await this.determineProjectStatus(trackingFiles, directory)
    } catch (error) {
      return {
        type: 'unknown',
        details: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      }
    }
  }

  async detectTrackingFiles(directory: ProjectDirectory): Promise<TrackingFile[]> {
    const trackingFiles: TrackingFile[] = []

    for (const file of directory.files) {
      const pattern = this.findMatchingPattern(file)
      if (pattern) {
        try {
          const filePath = path.join(directory.path, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const stats = await fs.stat(filePath)
          
          const trackingInfo = await this.parseTrackingContent(content, pattern.type)
          
          trackingFiles.push({
            path: filePath,
            type: pattern.type,
            content: trackingInfo,
            lastModified: stats.mtime,
          })
        } catch (error) {
          // Skip files we can't read
          continue
        }
      }
    }

    return trackingFiles
  }

  async parsePhaseInformation(content: string): Promise<PhaseInfo | null> {
    // Look for patterns like "Phase 2/5" or "Phase 2: Implementation"
    const phaseRegex = /(?:phase|Phase)\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*:\s*([^\n]+))?/gi
    const match = phaseRegex.exec(content)

    if (match) {
      return {
        current: parseInt(match[1], 10),
        total: match[2] ? parseInt(match[2], 10) : 0,
        name: match[3]?.trim(),
      }
    }

    // Look for project status indicators
    const statusRegex = /(?:status|Status)\s*:\s*([^\n]+)/gi
    const statusMatch = statusRegex.exec(content)
    
    if (statusMatch) {
      const status = statusMatch[1].toLowerCase()
      if (status.includes('complete') || status.includes('finished')) {
        return { current: 1, total: 1, name: 'Complete' }
      }
      if (status.includes('in progress') || status.includes('active')) {
        return { current: 1, total: 2, name: 'In Progress' }
      }
    }

    return null
  }

  private findMatchingPattern(filename: string): TrackingPattern | null {
    return this.patterns.find(pattern => {
      if (pattern.pattern.includes('*')) {
        // Simple glob matching - escape special regex chars except *
        const escapedPattern = pattern.pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
          .replace(/\*/g, '.*') // Convert * to .*
        const regex = new RegExp('^' + escapedPattern + '$', 'i')
        return regex.test(filename)
      }
      return filename.toLowerCase() === pattern.pattern.toLowerCase()
    }) || null
  }

  private async parseTrackingContent(content: string, type: TrackingType): Promise<TrackingInfo> {
    const info: TrackingInfo = {}

    // Parse based on file type
    switch (type) {
      case TrackingType.Claude:
        return this.parseClaudeFile(content)
      case TrackingType.ProjectPlan:
        return this.parseProjectPlan(content)
      case TrackingType.Epics:
        return this.parseEpicsFile(content)
      case TrackingType.Todo:
        return this.parseTodoFile(content)
      case TrackingType.Custom:
      default:
        return this.parseGenericFile(content)
    }
  }

  private async determineProjectStatus(trackingFiles: TrackingFile[], directory: ProjectDirectory): Promise<ProjectStatus> {
    let bestStatus: ProjectStatus = {
      type: 'unknown',
      details: 'Could not determine status',
      confidence: 0.1,
    }

    for (const file of trackingFiles) {
      const status = this.analyzeTrackingFile(file, directory)
      if (status.confidence > bestStatus.confidence) {
        bestStatus = status
      }
    }

    return bestStatus
  }

  private analyzeTrackingFile(file: TrackingFile, directory: ProjectDirectory): ProjectStatus {
    const { content, type } = file

    // Phase-based analysis
    if (content.phases) {
      const { current, total, name } = content.phases
      if (total > 0) {
        const progress = current / total
        if (progress >= 1.0) {
          return {
            type: 'stable',
            details: name || 'Complete',
            confidence: 0.9,
          }
        } else {
          return {
            type: 'phase',
            details: `Phase ${current}/${total}${name ? ` (${name})` : ''}`,
            confidence: 0.8,
          }
        }
      } else {
        return {
          type: 'phase',
          details: `Phase ${current}${name ? ` (${name})` : ''}`,
          confidence: 0.7,
        }
      }
    }

    // Version-based analysis
    if (content.version) {
      const version = content.version
      if (version.startsWith('1.') || version.startsWith('2.') || parseFloat(version) >= 1.0) {
        return {
          type: 'stable',
          details: `v${version}`,
          confidence: 0.6,
        }
      } else {
        return {
          type: 'active',
          details: `v${version} (pre-release)`,
          confidence: 0.5,
        }
      }
    }

    // TODO-based analysis
    if (content.todos !== undefined) {
      if (content.todos === 0) {
        return {
          type: 'stable',
          details: 'No outstanding TODOs',
          confidence: 0.4,
        }
      } else if (content.todos < 5) {
        return {
          type: 'active',
          details: `${content.todos} TODOs remaining`,
          confidence: 0.4,
        }
      } else {
        return {
          type: 'active',
          details: `${content.todos} TODOs (active development)`,
          confidence: 0.3,
        }
      }
    }

    // Fallback analysis based on file type
    if (type === TrackingType.Claude || type === TrackingType.ProjectPlan) {
      return {
        type: 'active',
        details: 'Has project tracking',
        confidence: 0.3,
      }
    }

    return {
      type: 'unknown',
      details: 'Tracking file found but could not parse status',
      confidence: 0.2,
    }
  }

  private extractClaudeDescription(content: string): string | undefined {
    // Look for project overview or core mission
    const overviewMatch = content.match(/(?:core mission|problem statement|project overview)\s*:?\s*([^\n]+)/gi)
    if (overviewMatch && overviewMatch.length > 0) {
      return overviewMatch[0].replace(/^[^:]+:\s*/, '').trim()
    }

    // Look for the first substantial paragraph after the title
    const lines = content.split('\n').filter(line => line.trim())
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.length > 50 && !line.startsWith('#') && !line.startsWith('**')) {
        return line
      }
    }

    return undefined
  }

  private extractReadmeDescription(content: string): string | undefined {
    // Look for the first paragraph after the title
    const lines = content.split('\n')
    let foundTitle = false
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip until we find a title
      if (!foundTitle && trimmed.startsWith('#')) {
        foundTitle = true
        continue
      }
      
      // Return the first substantial line after the title
      if (foundTitle && trimmed.length > 20 && !trimmed.startsWith('#') && !trimmed.startsWith('**')) {
        return trimmed
      }
    }

    return undefined
  }

  private parseClaudeFile(content: string): TrackingInfo {
    const info: TrackingInfo = {}
    
    // Look for project phase information
    const phaseMatch = content.match(/(?:phase|Phase)\s*(\d+)(?:\s*\/\s*(\d+))?/i)
    if (phaseMatch) {
      info.phases = {
        current: parseInt(phaseMatch[1], 10),
        total: phaseMatch[2] ? parseInt(phaseMatch[2], 10) : 0,
      }
    }

    // Look for project overview/description
    const overviewMatch = content.match(/(?:core mission|problem statement)\s*:?\s*([^\n]+)/gi)
    if (overviewMatch && overviewMatch.length > 0) {
      info.description = overviewMatch[0].replace(/^[^:]+:\s*/, '').trim()
    }

    // Count TODOs
    const todoMatches = content.match(/(?:TODO|FIXME|HACK|NOTE)\b/gi)
    if (todoMatches) {
      info.todos = todoMatches.length
    }

    return info
  }

  private parseProjectPlan(content: string): TrackingInfo {
    const info: TrackingInfo = {}
    
    // Count completed vs total tasks
    const totalTasks = (content.match(/^\s*-\s*\[[ x]\]/gm) || []).length
    const completedTasks = (content.match(/^\s*-\s*\[x\]/gm) || []).length
    
    if (totalTasks > 0) {
      info.phases = {
        current: completedTasks,
        total: totalTasks,
      }
    }

    return info
  }

  private parseEpicsFile(content: string): TrackingInfo {
    const info: TrackingInfo = {}
    
    // Count epic completion
    const totalEpics = (content.match(/^#{2,3}\s/gm) || []).length
    const completedEpics = (content.match(/^#{2,3}\s.*(?:complete|done|✓)/gmi) || []).length
    
    if (totalEpics > 0) {
      info.phases = {
        current: completedEpics,
        total: totalEpics,
      }
    }

    return info
  }

  private parseTodoFile(content: string): TrackingInfo {
    const info: TrackingInfo = {}
    
    const totalItems = (content.match(/^\s*-\s/gm) || []).length
    const completedItems = (content.match(/^\s*-\s.*(?:done|complete|✓)/gmi) || []).length
    
    info.todos = totalItems - completedItems
    
    if (totalItems > 0) {
      info.phases = {
        current: completedItems,
        total: totalItems,
      }
    }

    return info
  }

  private parseGenericFile(content: string): TrackingInfo {
    const info: TrackingInfo = {}
    
    // Count TODO items
    const todoMatches = content.match(/(?:TODO|FIXME|HACK|NOTE)\b/gi)
    if (todoMatches) {
      info.todos = todoMatches.length
    }

    // Extract description for README files
    const lines = content.split('\n')
    let foundTitle = false
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      if (!foundTitle && trimmed.startsWith('#')) {
        foundTitle = true
        continue
      }
      
      if (foundTitle && trimmed.length > 10) {
        // Skip empty lines, image tags, badges, and notes
        if (trimmed === '' || 
            trimmed.startsWith('<img') || 
            trimmed.startsWith('![') || 
            trimmed.startsWith('[!') ||
            trimmed.startsWith('#') ||
            trimmed.startsWith('>')) {
          continue
        }
        
        // Found meaningful content - look for actual descriptions
        if (trimmed.length > 30 && !trimmed.startsWith('##')) {
          info.description = trimmed
          break
        }
      }
    }

    return info
  }
}
