import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { installWrapperInto, escapeRegExp, stripWrapperBlocks } from '../src/lib/shell/wrapper'

const begin = '# >>> projector wrapper >>>'
const end = '# <<< projector wrapper <<<'

function countOcc(content: string, needle: string) {
  return (content.match(new RegExp(escapeRegExp(needle), 'g')) || []).length
}

describe('shell wrapper install/remove behavior', () => {
  let tmpFile: string

  beforeEach(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projector-rc-'))
    tmpFile = path.join(tmpDir, 'rc.sh')
    await fs.writeFile(tmpFile, '# test rc\nexport FOO=bar\n', 'utf8')
  })

  it('install twice still yields a removable single wrapper block', async () => {
    const content = 'function projector() {\n  :\n}\n'
    await installWrapperInto(tmpFile, content)
    await installWrapperInto(tmpFile, content)

    const before = await fs.readFile(tmpFile, 'utf8')
    expect(before).toContain(begin)
    expect(before).toContain(end)

    // Use the shared helper to remove
    const before2 = await fs.readFile(tmpFile, 'utf8')
    const { updated } = stripWrapperBlocks(before2)
    await fs.writeFile(tmpFile, updated, 'utf8')
    const after = updated
    expect(countOcc(after, begin)).toBe(0)
    expect(countOcc(after, end)).toBe(0)
  })

  it('regex escaping helper correctly escapes markers for removal', async () => {
    const content = 'function projector() {\n  :\n}\n'
    await installWrapperInto(tmpFile, content)
    const original = await fs.readFile(tmpFile, 'utf8')
    const escapedBegin = escapeRegExp(begin)
    const escapedEnd = escapeRegExp(end)
    const re = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, 'g')
    const updated = original.replace(re, '').trimEnd() + '\n'
    expect(updated).not.toContain(begin)
    expect(updated).not.toContain(end)
  })
})
