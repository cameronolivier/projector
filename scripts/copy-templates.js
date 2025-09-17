#!/usr/bin/env node
const fs = require('fs/promises')
const path = require('path')

async function main() {
  const root = path.resolve(__dirname, '..')
  const source = path.join(root, 'src', 'templates')
  const destination = path.join(root, 'dist', 'templates')

  const sourceExists = await exists(source)
  if (!sourceExists) {
    return
  }

  await fs.rm(destination, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true })
}

async function exists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

main().catch((error) => {
  console.error('Failed to copy template assets:', error)
  process.exit(1)
})
