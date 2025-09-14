export interface NamedProject {
  name: string
  path: string
}

/**
 * Case-insensitive substring filter on project name.
 */
export function filterByName<T extends NamedProject>(projects: T[], pattern?: string): T[] {
  if (!pattern || !pattern.trim()) return projects
  const q = pattern.trim().toLowerCase()
  return projects.filter(p => p.name.toLowerCase().includes(q))
}

/**
 * Format output for jump command.
 * When printCd is true, returns shell-ready cd command; otherwise returns the raw path.
 */
export function formatOutputPath(path: string, printCd: boolean): string {
  return printCd ? `cd "${path}"` : path
}

