import * as path from 'path'

export function deriveParentTag(projectPath: string, scanRoot: string): string | undefined {
  const relative = path.relative(scanRoot, projectPath)
  if (!relative || relative.startsWith('..')) {
    return undefined
  }

  const segments = relative.split(path.sep).filter(Boolean)
  if (segments.length <= 1) {
    return undefined
  }

  return segments[segments.length - 2]
}

export function truncateTag(tag: string, maxLength: number): string {
  if (tag.length <= maxLength) {
    return tag
  }
  if (maxLength <= 1) {
    return tag.slice(0, maxLength)
  }
  return `${tag.slice(0, maxLength - 1)}…`
}

export function hashTag(tag: string): number {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}
