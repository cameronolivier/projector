#!/usr/bin/env node

/**
 * Ensures that commits touching key project areas include a changeset.
 * Set SKIP_CHANGESET_CHECK=1 to bypass (e.g., for release commits).
 */

const { execSync } = require('node:child_process')

if (process.env.SKIP_CHANGESET_CHECK === '1') {
  process.exit(0)
}

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' })
    return output.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch (error) {
    console.error('Failed to inspect staged files:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

const stagedFiles = getStagedFiles()

// Paths that should trigger a changelog entry.
const watchedPatterns = [
  /^src\//,
  /^docs\//,
  /^test\//,
  /^scripts\//,
  /^dist\//,
  /^AGENTS\.md$/,
  /^README\.md$/,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
]

const requiresChangeset = stagedFiles.some((file) => watchedPatterns.some((pattern) => pattern.test(file)))
const hasChangeset = stagedFiles.some((file) => file.startsWith('.changeset/') && file.endsWith('.md'))

if (requiresChangeset && !hasChangeset) {
  console.error('❌ Missing changeset note.')
  console.error('Run `corepack pnpm changeset` to document your change.')
  console.error('Set SKIP_CHANGESET_CHECK=1 to bypass (e.g., for release automation).')
  process.exit(1)
}
