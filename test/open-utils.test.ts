import { mapEditorCommand, supportedEditors, defaultEditorFromEnv, isGuiEditor } from '../src/lib/commands/open-utils'

const envDarwinNoCli = {
  platform: 'darwin' as NodeJS.Platform,
  cliAvailable: (_: string) => false,
}

const envDarwinCli = {
  platform: 'darwin' as NodeJS.Platform,
  cliAvailable: (_: string) => true,
}

describe('supportedEditors', () => {
  it('includes expected editors', () => {
    const list = supportedEditors()
    expect(list).toEqual(expect.arrayContaining(['code', 'webstorm', 'idea', 'intellij', 'cursor', 'sublime', 'vim', 'nvim']))
  })
})

describe('mapEditorCommand', () => {
  it('maps VS Code with CLI available (with --wait)', () => {
    const { cmd, args } = mapEditorCommand('code', '/p', { wait: true, editorArgs: ['--reuse-window'] }, envDarwinCli)
    expect(cmd).toBe('code')
    expect(args).toEqual(['--wait', '--reuse-window', '/p'])
  })

  it('falls back to macOS open for VS Code when CLI not available', () => {
    const { cmd, args } = mapEditorCommand('code', '/p', { wait: false }, envDarwinNoCli)
    expect(cmd).toBe('open')
    expect(args).toEqual(['-a', 'Visual Studio Code', '/p'])
  })

  it('uses webstorm CLI when available', () => {
    const { cmd, args } = mapEditorCommand('webstorm', '/p', { editorArgs: ['--line', '10'] }, envDarwinCli)
    expect(cmd).toBe('webstorm')
    expect(args).toEqual(['--line', '10', '/p'])
  })

  it('falls back to macOS open for WebStorm when CLI not available', () => {
    const { cmd, args } = mapEditorCommand('webstorm', '/p', {}, envDarwinNoCli)
    expect(cmd).toBe('open')
    expect(args).toEqual(['-a', 'WebStorm', '/p'])
  })

  it('maps terminal editors without fallback', () => {
    expect(mapEditorCommand('vim', '/p', {}, envDarwinNoCli)).toEqual({ cmd: 'vim', args: ['/p'] })
    expect(mapEditorCommand('nvim', '/p', { editorArgs: ['+10'] }, envDarwinNoCli)).toEqual({ cmd: 'nvim', args: ['+10', '/p'] })
  })
})

describe('defaultEditorFromEnv', () => {
  it('defaults to code when unset or unknown', () => {
    expect(defaultEditorFromEnv({} as any)).toBe('code')
    expect(defaultEditorFromEnv({ PROJECTOR_DEFAULT_EDITOR: 'unknown' } as any)).toBe('code')
  })

  it('honors a supported editor value', () => {
    expect(defaultEditorFromEnv({ PROJECTOR_DEFAULT_EDITOR: 'webstorm' } as any)).toBe('webstorm')
  })
})

describe('isGuiEditor', () => {
  it('returns true for GUI editors and false for terminal editors', () => {
    expect(isGuiEditor('code')).toBe(true)
    expect(isGuiEditor('webstorm')).toBe(true)
    expect(isGuiEditor('vim')).toBe(false)
    expect(isGuiEditor('nvim')).toBe(false)
  })
})

describe('platform-specific fallbacks', () => {
  const envWinNoCli = { platform: 'win32' as NodeJS.Platform, cliAvailable: (_: string) => false }

  it('uses raw code invocation on non-mac when CLI not available', () => {
    const { cmd, args } = mapEditorCommand('code', 'C:/p', { wait: false }, envWinNoCli)
    expect(cmd).toBe('code')
    expect(args).toEqual(['C:/p'])
  })

  it('falls back for IntelliJ on mac when CLI not available', () => {
    const { cmd, args } = mapEditorCommand('idea', '/p', {}, envDarwinNoCli)
    expect(cmd).toBe('open')
    expect(args).toEqual(['-a', 'IntelliJ IDEA', '/p'])
  })
})
