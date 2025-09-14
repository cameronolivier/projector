#!/usr/bin/env node

import { run } from '@oclif/core'

async function main() {
  try {
    // If no arguments provided or only flags, default to 'list' command
    const argv = process.argv.slice(2)
    const hasCommand = argv.length > 0 && !argv[0].startsWith('-')
    const isHelp = argv.includes('--help') || argv.includes('-h')
    
    if (!hasCommand && !isHelp) {
      // No command provided and not asking for help, add 'list' as default
      argv.unshift('list')
      process.argv = ['node', 'projector', ...argv]
    }
    
    await run()
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
