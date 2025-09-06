#!/usr/bin/env node

import { run } from '@oclif/core'

async function main() {
  try {
    await run()
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
