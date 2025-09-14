import * as fs from 'fs'
import * as path from 'path'

export type EditorId =
  | 'code'
  | 'webstorm'
  | 'idea'
  | 'intellij'
  | 'cursor'
  | 'sublime'
  | 'vim'
  | 'nvim'

export interface OpenOptions {
  wait?: boolean
  editorArgs?: string[]
}

export interface EnvProbe {
  platform: NodeJS.Platform
  cliAvailable: (bin: string) => boolean
}

export function supportedEditors(): EditorId[] {
  return ['code', 'webstorm', 'idea', 'intellij', 'cursor', 'sublime', 'vim', 'nvim']
}

export function defaultEditorFromEnv(env: NodeJS.ProcessEnv): EditorId {
  const v = (env.PROJECTOR_DEFAULT_EDITOR || 'code').toLowerCase()
  const list = supportedEditors()
  return (list.includes(v as EditorId) ? (v as EditorId) : 'code')
}

export function isGuiEditor(editor: EditorId): boolean {
  return ['code', 'webstorm', 'idea', 'intellij', 'cursor', 'sublime'].includes(editor)
}

// Pure mapping function for tests
export function mapEditorCommand(
  editor: EditorId,
  projectPath: string,
  opts: OpenOptions,
  env: EnvProbe,
): { cmd: string; args: string[] } {
  const args = opts.editorArgs || []
  const platform = env.platform
  const macOpen = (appName: string) => ({ cmd: 'open', args: ['-a', appName, projectPath] })

  switch (editor) {
    case 'code': {
      if (env.cliAvailable('code')) {
        const a = [...(opts.wait ? ['--wait'] as string[] : []), ...args, projectPath]
        return { cmd: 'code', args: a }
      }
      if (platform === 'darwin') return macOpen('Visual Studio Code')
      return { cmd: 'code', args: [projectPath] }
    }
    case 'webstorm': {
      if (env.cliAvailable('webstorm')) return { cmd: 'webstorm', args: [...args, projectPath] }
      if (platform === 'darwin') return macOpen('WebStorm')
      return { cmd: 'webstorm', args: [projectPath] }
    }
    case 'idea':
    case 'intellij': {
      const bin = 'idea'
      if (env.cliAvailable(bin)) return { cmd: bin, args: [...args, projectPath] }
      if (platform === 'darwin') return macOpen('IntelliJ IDEA')
      return { cmd: bin, args: [projectPath] }
    }
    case 'cursor': {
      if (env.cliAvailable('cursor')) return { cmd: 'cursor', args: [...args, projectPath] }
      if (platform === 'darwin') return macOpen('Cursor')
      return { cmd: 'cursor', args: [projectPath] }
    }
    case 'sublime': {
      if (env.cliAvailable('subl')) return { cmd: 'subl', args: [...args, projectPath] }
      if (platform === 'darwin') return macOpen('Sublime Text')
      return { cmd: 'subl', args: [projectPath] }
    }
    case 'vim':
      return { cmd: 'vim', args: [...args, projectPath] }
    case 'nvim':
      return { cmd: 'nvim', args: [...args, projectPath] }
    default:
      return { cmd: editor, args: [...args, projectPath] }
  }
}

// Real environment probe and builder
export function buildEditorCommand(editor: EditorId, projectPath: string, opts: OpenOptions) {
  const env: EnvProbe = {
    platform: process.platform,
    cliAvailable: (bin: string) => isOnPath(bin),
  }
  return mapEditorCommand(editor, projectPath, opts, env)
}

function isOnPath(bin: string): boolean {
  const paths = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const p of paths) {
    const full = path.join(p, bin + (process.platform === 'win32' ? '.exe' : ''))
    try {
      fs.accessSync(full, fs.constants.X_OK)
      return true
    } catch {}
  }
  return false
}

