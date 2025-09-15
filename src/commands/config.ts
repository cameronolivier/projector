import { Command, Flags } from '@oclif/core'
import { ConfigurationManager } from '../lib/config/config.js'
import { stringify } from 'yaml'
import chalk from 'chalk'

export default class ConfigCmd extends Command {
  static override description = 'View the merged configuration or show its file location (see docs/config.md for details)'

  static override examples = [
    {
      description: 'Print the merged configuration (YAML)',
      command: '<%= config.bin %> config --print',
    },
    {
      description: 'Show the config file path',
      command: '<%= config.bin %> config --path',
    },
  ]

  static override flags = {
    print: Flags.boolean({
      char: 'p',
      description: 'Print merged configuration (YAML). See docs/config.md for all fields',
      default: false,
    }),
    path: Flags.boolean({
      description: 'Print the configuration file path on disk',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigCmd)
    const manager = new ConfigurationManager()
    const config = await manager.loadConfig()

    if (!flags.print && !flags.path) {
      // Default to print merged config for convenience
      flags.print = true
    }

    if (flags.path) {
      this.log(manager.getPath())
    }

    if (flags.print) {
      const yaml = stringify(config)
      this.log(yaml.trim())
      this.log('\n' + chalk.gray('For field descriptions, see docs/config.md'))
    }
  }
}

