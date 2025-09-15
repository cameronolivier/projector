import { ConfigurationManager } from '../src/lib/config/config'
import { getWrapperForShell } from '../src/lib/shell/wrapper'

describe('cdSentinel configuration is respected', () => {
  it('getWrapperForShell uses provided sentinel across shells', () => {
    const sentinel = '___CUSTOM___'
    const z = getWrapperForShell('zsh', sentinel)!
    const f = getWrapperForShell('fish', sentinel)!
    const p = getWrapperForShell('powershell', sentinel)!
    expect(z).toContain(sentinel)
    expect(f).toContain(sentinel)
    expect(p).toContain(sentinel)
  })

  it('ConfigurationManager default exposes a sentinel', async () => {
    const cm = new ConfigurationManager()
    const cfg = await cm.loadConfig()
    expect(typeof cfg.cdSentinel).toBe('string')
    expect((cfg.cdSentinel as string).length).toBeGreaterThan(0)
  })
})
