import { filterByName, formatOutputPath } from '../src/lib/commands/jump-utils'

describe('filterByName', () => {
  const projects = [
    { name: 'api-server', path: '/dev/api-server' },
    { name: 'Web-App', path: '/dev/web-app' },
    { name: 'cli-tools', path: '/dev/cli-tools' },
  ]

  it('returns all projects when pattern is empty or whitespace', () => {
    expect(filterByName(projects, '')).toHaveLength(3)
    expect(filterByName(projects, '   ')).toHaveLength(3)
    expect(filterByName(projects)).toHaveLength(3)
  })

  it('matches case-insensitive substrings', () => {
    expect(filterByName(projects, 'API')).toEqual([
      { name: 'api-server', path: '/dev/api-server' },
    ])
    expect(filterByName(projects, 'app')).toEqual([
      { name: 'Web-App', path: '/dev/web-app' },
    ])
  })

  it('returns empty array when no match', () => {
    expect(filterByName(projects, 'missing')).toEqual([])
  })
})

describe('formatOutputPath', () => {
  it('returns path when printCd is false', () => {
    expect(formatOutputPath('/dev/api-server', false)).toBe('/dev/api-server')
  })

  it('returns cd command when printCd is true', () => {
    expect(formatOutputPath('/dev/api-server', true)).toBe('cd "/dev/api-server"')
  })
})

