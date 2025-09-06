import Table from 'cli-table3'
import chalk from 'chalk'
import { AnalyzedProject, ColorScheme } from '../types.js'

export class TableGenerator {
  generateTable(projects: AnalyzedProject[], colorScheme?: ColorScheme): string {
    const table = new Table({
      head: [
        chalk.hex(colorScheme?.header || '#00d4ff').bold('📁 Project'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Status'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Type'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Description')
      ],
      style: {
        head: [],
        border: ['gray']
      },
      colWidths: [20, 15, 12, 60],
      wordWrap: true
    })

    // Sort projects: tracked first, then by name
    const sortedProjects = [...projects].sort((a, b) => {
      // Prioritize projects with tracking
      if (a.status.type !== 'unknown' && b.status.type === 'unknown') return -1
      if (a.status.type === 'unknown' && b.status.type !== 'unknown') return 1
      
      // Then sort alphabetically
      return a.name.localeCompare(b.name)
    })

    for (const project of sortedProjects) {
      const row = this.formatRow(project, colorScheme)
      table.push(row)
    }

    return table.toString()
  }

  formatRow(project: AnalyzedProject, colorScheme?: ColorScheme): string[] {
    const projectName = chalk.hex(colorScheme?.projectName || '#ffffff')(project.name)
    const status = this.formatStatus(project.status.details, project.status.type, colorScheme)
    const type = this.formatProjectType(project.type, project.languages)
    const description = this.formatDescription(project.description, project.status.confidence)

    return [projectName, status, type, description]
  }

  private formatStatus(details: string, type: string, colorScheme?: ColorScheme): string {
    switch (type) {
      case 'phase':
        return chalk.hex(colorScheme?.phaseStatus || '#ff6b35')(details)
      case 'stable':
        return chalk.hex(colorScheme?.stableStatus || '#4caf50')(`✓ ${details}`)
      case 'active':
        return chalk.hex(colorScheme?.phaseStatus || '#ff6b35')(`⚡ ${details}`)
      case 'archived':
        return chalk.hex(colorScheme?.unknownStatus || '#9e9e9e')(`📦 ${details}`)
      case 'unknown':
      default:
        return chalk.hex(colorScheme?.unknownStatus || '#9e9e9e')(`❓ ${details}`)
    }
  }

  private formatProjectType(type: string, languages: string[]): string {
    const primaryLanguage = languages[0] || 'Unknown'
    
    // Color code by project type
    const typeColors: Record<string, string> = {
      'nodejs': '#68a063',      // Node green
      'python': '#3776ab',      // Python blue
      'rust': '#ce422b',        // Rust orange
      'go': '#00add8',          // Go cyan
      'php': '#777bb4',         // PHP purple
      'java': '#ed8b00',        // Java orange
      'unknown': '#666666',     // Gray
    }

    const color = typeColors[type] || typeColors['unknown']
    return chalk.hex(color)(primaryLanguage)
  }

  private formatDescription(description: string, confidence: number): string {
    if (!description || description === 'Description not yet implemented') {
      return chalk.gray('No description available')
    }

    // Clean up HTML/markdown content
    let cleaned = this.cleanDescription(description)
    
    // Apply coloring based on confidence
    if (confidence < 0.3) {
      return chalk.dim(cleaned)
    }

    return cleaned
  }

  private cleanDescription(description: string): string {
    // Remove HTML tags
    let cleaned = description.replace(/<[^>]*>/g, '')
    
    // Remove markdown image syntax
    cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, '')
    
    // Remove markdown links but keep the text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    
    // Remove excessive whitespace and newlines
    cleaned = cleaned.replace(/\s+/g, ' ').trim()
    
    // Remove common prefixes
    cleaned = cleaned.replace(/^[\-\*\>\s]+/, '')
    
    // Handle specific patterns like "[![..." badges
    cleaned = cleaned.replace(/\[!\[.*?\].*?\]/g, '')
    
    // Clean up remaining artifacts
    cleaned = cleaned.replace(/^[\s\-\*\>]+/, '')
    cleaned = cleaned.replace(/\s{2,}/g, ' ')
    
    return cleaned.trim() || 'No description available'
  }

  generateSummary(projects: AnalyzedProject[]): string {
    const total = projects.length
    const withTracking = projects.filter(p => p.status.type !== 'unknown').length
    const byType = projects.reduce((acc, project) => {
      acc[project.status.type] = (acc[project.status.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const summaryParts = []
    summaryParts.push(chalk.bold(`Found ${total} projects`))
    
    if (withTracking > 0) {
      summaryParts.push(chalk.green(`${withTracking} with tracking`))
    }
    
    if (byType.phase) {
      summaryParts.push(chalk.hex('#ff6b35')(`${byType.phase} in development`))
    }
    
    if (byType.stable) {
      summaryParts.push(chalk.green(`${byType.stable} stable`))
    }
    
    if (byType.unknown) {
      summaryParts.push(chalk.gray(`${byType.unknown} unknown`))
    }

    return summaryParts.join(', ')
  }

  generateCompactView(projects: AnalyzedProject[]): string {
    const lines: string[] = []
    
    for (const project of projects) {
      const status = this.getStatusIcon(project.status.type)
      const name = chalk.bold(project.name)
      const details = chalk.dim(project.status.details)
      
      lines.push(`${status} ${name} - ${details}`)
    }

    return lines.join('\\n')
  }

  private getStatusIcon(statusType: string): string {
    switch (statusType) {
      case 'phase': return '🔄'
      case 'stable': return '✅'
      case 'active': return '⚡'
      case 'archived': return '📦'
      case 'unknown': return '❓'
      default: return '❓'
    }
  }
}
