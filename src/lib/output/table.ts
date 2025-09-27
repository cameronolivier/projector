import Table from 'cli-table3'
import chalk from 'chalk'
import * as path from 'path'
import * as os from 'os'
import { AnalyzedProject, ColorScheme, GitInsights } from '../types.js'

export class TableGenerator {
  generateTable(projects: AnalyzedProject[], colorScheme?: ColorScheme): string {
    const table = new Table({
      head: [
        chalk.hex(colorScheme?.header || '#00d4ff').bold('📁 Project'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Status'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Git'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Type'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('📍 Location'),
        chalk.hex(colorScheme?.header || '#00d4ff').bold('Description')
      ],
      style: {
        head: [],
        border: ['gray']
      },
      colWidths: [20, 15, 28, 12, 32, 45],
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
    const git = this.formatGit(project.git)
    const type = this.formatProjectType(project.type, project.languages)
    const location = this.formatLocation(project.path)
    const description = this.formatDescription(project.description, project.status.confidence)

    return [projectName, status, git, type, location, description]
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

  private formatLocation(projectPath: string): string {
    // Replace home directory with ~ for shorter display
    const homeDir = os.homedir()
    let displayPath = projectPath.replace(homeDir, '~')
    
    // If the path is too long, show parent directory + project name
    if (displayPath.length > 30) {
      const parts = displayPath.split(path.sep)
      if (parts.length > 2) {
        // Show ~/...parent/project format
        const projectName = parts[parts.length - 1]
        const parentDir = parts[parts.length - 2]
        displayPath = `~/.../${parentDir}/${projectName}`
      }
    }
    
    return chalk.dim(displayPath)
  }

  private formatProjectType(type: string, languages: string[]): string {
    // Map project types to display names
    const typeDisplayNames: Record<string, string> = {
      'nodejs': 'Node.js',
      'python': 'Python',
      'rust': 'Rust',
      'go': 'Go',
      'php': 'PHP',
      'java': 'Java',
      'unknown': 'Unknown',
    }
    
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

    const displayName = typeDisplayNames[type] || typeDisplayNames['unknown']
    const color = typeColors[type] || typeColors['unknown']
    return chalk.hex(color)(displayName)
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

  private formatGit(git?: GitInsights): string {
    if (!git) {
      return chalk.gray('—')
    }

    const parts: string[] = []
    parts.push(chalk.cyan(git.currentBranch))

    if (git.head?.committedAt) {
      parts.push(chalk.dim(this.formatRelativeTime(git.head.committedAt)))
    }

    if (git.commitsInWindow.count > 0) {
      parts.push(chalk.green(`${git.commitsInWindow.count}/${git.commitsInWindow.windowDays}d`))
    } else {
      parts.push(chalk.gray(`0/${git.commitsInWindow.windowDays}d`))
    }

    if (typeof git.ahead === 'number' || typeof git.behind === 'number') {
      const ahead = typeof git.ahead === 'number' && git.ahead > 0 ? `↑${git.ahead}` : ''
      const behind = typeof git.behind === 'number' && git.behind > 0 ? `↓${git.behind}` : ''
      const divergence = [ahead, behind].filter(Boolean).join(' ')
      if (divergence.length > 0) {
        parts.push(chalk.hex('#f0ad4e')(divergence))
      }
    }

    if (git.staleBranches.total > 0) {
      const label = git.staleBranches.total === 1 ? 'stale branch' : 'stale branches'
      parts.push(chalk.hex('#ff6b35')(`${git.staleBranches.total} ${label}`))
    }

    return parts.join(chalk.dim(' • '))
  }

  private formatRelativeTime(timestamp: number): string {
    if (!timestamp) {
      return '—'
    }

    const diff = Date.now() - timestamp
    if (diff < 0) {
      return '—'
    }

    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const month = 30 * day
    const year = 365 * day

    if (diff < minute) {
      return 'just now'
    }
    if (diff < hour) {
      const minutes = Math.round(diff / minute)
      return `${minutes}m ago`
    }
    if (diff < day) {
      const hours = Math.round(diff / hour)
      return `${hours}h ago`
    }
    if (diff < month) {
      const days = Math.round(diff / day)
      return `${days}d ago`
    }
    if (diff < year) {
      const months = Math.round(diff / month)
      return `${months}mo ago`
    }
    const years = Math.round(diff / year)
    return `${years}y ago`
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
    const gitEnabledCount = projects.filter(p => p.git).length
    const gitStaleCount = projects.filter(p => p.git && p.git.staleBranches.total > 0).length
    const gitQuietCount = projects.filter(p => p.git && p.git.commitsInWindow.count === 0).length
    const gitWindow = projects.find(p => p.git)?.git?.commitsInWindow.windowDays

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

    if (gitEnabledCount > 0) {
      summaryParts.push(chalk.cyan(`${gitEnabledCount} git-enabled`))
    }

    if (gitStaleCount > 0) {
      summaryParts.push(chalk.hex('#ff6b35')(`${gitStaleCount} with stale branches`))
    }

    if (gitQuietCount > 0 && gitWindow) {
      summaryParts.push(chalk.gray(`${gitQuietCount} no commits ${gitWindow}d`))
    }

    return summaryParts.join(', ')
  }

  generateCompactView(projects: AnalyzedProject[]): string {
    const lines: string[] = []
    
    for (const project of projects) {
      const status = this.getStatusIcon(project.status.type)
      const name = chalk.bold(project.name)
      const details = chalk.dim(project.status.details)
      let git = ''
      if (project.git) {
        git = chalk.dim(` [${project.git.currentBranch}, ${project.git.commitsInWindow.count}/${project.git.commitsInWindow.windowDays}d]`)
      }

      lines.push(`${status} ${name} - ${details}${git}`)
    }

    return lines.join('\\n')
  }

  generateGitDetails(projects: AnalyzedProject[]): string | null {
    const gitProjects = projects.filter(p => p.git)
    if (gitProjects.length === 0) {
      return null
    }

    const sortedByRecent = [...gitProjects]
      .sort((a, b) => (b.git!.head?.committedAt || 0) - (a.git!.head?.committedAt || 0))
      .slice(0, 5)

    const recentLines = sortedByRecent.map(project => {
      const git = project.git!
      const rel = git.head?.committedAt ? this.formatRelativeTime(git.head.committedAt) : 'n/a'
      const commits = `${git.commitsInWindow.count}/${git.commitsInWindow.windowDays}d`
      const stale = git.staleBranches.total > 0 ? `, ${git.staleBranches.total} stale` : ''
      return `  • ${project.name}: ${git.currentBranch} — ${rel}, ${commits}${stale}`
    })

    const staleProjects = gitProjects
      .filter(p => p.git!.staleBranches.total > 0)
      .slice(0, 5)

    const lines: string[] = []
    lines.push(chalk.bold('Git insights'))
    lines.push(...recentLines)

    if (staleProjects.length > 0) {
      lines.push(chalk.hex('#ff6b35')('  • Stale branches:'))
      for (const project of staleProjects) {
        const git = project.git!
        const names = git.staleBranches.sample.length > 0 ? ` (${git.staleBranches.sample.join(', ')})` : ''
        lines.push(chalk.hex('#ff6b35')(`    - ${project.name}: ${git.staleBranches.total}${names}`))
      }
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
