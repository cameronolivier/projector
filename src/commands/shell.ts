import { Command, Flags } from '@oclif/core'
import inquirer from 'inquirer'
import chalk from 'chalk'
import * as os from 'os'
import { detectShell, findRcCandidates, getWrapperForShell, installWrapperInto, shortenHome } from '../lib/shell/wrapper.js'
import * as fs from 'fs/promises'

export default class ShellCmd extends Command {
  static override description = 'Manage shell integration (install or remove the projector shell wrapper)'

  static override examples = [
    { description: 'Interactive install/update of the shell wrapper', command: '<%= config.bin %> shell --install' },
    { description: 'Choose a specific rc file to write to', command: '<%= config.bin %> shell --install --rc ~/.zshrc' },
  ]

  static override flags = {
    install: Flags.boolean({ description: 'Install or update the projector shell wrapper', default: false }),
    remove: Flags.boolean({ description: 'Remove the projector shell wrapper block from a shell rc', default: false }),
    rc: Flags.string({ description: 'Path to the shell rc file (e.g., ~/.zshrc)', helpValue: '~/.zshrc' }),
    shell: Flags.string({ description: 'Shell kind', options: ['zsh', 'bash', 'fish', 'powershell'] }),
    'dry-run': Flags.boolean({ description: 'Print what would change without modifying files', default: false }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ShellCmd)

    const wantsInstall = Boolean(flags.install) || (!flags.remove)
    const wantsRemove = Boolean(flags.remove)

    if (wantsInstall && wantsRemove) {
      this.error('Specify either --install or --remove, not both.')
      return
    }

    const shellKind = (flags.shell as any) || detectShell()
    const sentinel = '__PROJECTOR_CD__'

    let rcPath = flags.rc ? flags.rc.replace('~', os.homedir()) : ''
    if (!rcPath) {
      const candidates = await findRcCandidates(shellKind)
      if (candidates.length === 0) {
        const { targetPath } = await inquirer.prompt<{ targetPath: string }>([
          { type: 'input', name: 'targetPath', message: 'No rc files found. Enter path to your shell rc:', filter: (v: string) => v.replace('~', os.homedir()) },
        ])
        rcPath = targetPath
      } else if (candidates.length === 1) {
        rcPath = candidates[0]
        this.log(`Using rc file: ${chalk.cyan(shortenHome(rcPath))}`)
      } else {
        const { selected } = await inquirer.prompt<{ selected: string }>([
          {
            type: 'list',
            name: 'selected',
            message: 'Multiple rc files found. Choose one:',
            choices: candidates.map((p) => ({ name: shortenHome(p), value: p })),
          },
        ])
        rcPath = selected
      }
    }

    if (wantsRemove) {
      if (flags['dry-run']) {
        await this.dryRunRemove(rcPath)
      } else {
        await this.removeWrapper(rcPath)
      }
      return
    }

    const content = getWrapperForShell(shellKind, sentinel)
    if (!content) {
      this.warn('Unknown shell; installing bash/zsh compatible wrapper.')
    }
    if (flags['dry-run']) {
      await this.dryRunInstall(rcPath, content || getWrapperForShell('zsh', sentinel)!)
    } else {
      const result = await installWrapperInto(rcPath, content || getWrapperForShell('zsh', sentinel)!)
      this.log(chalk.gray(`Backup created: ${shortenHome(result.backupPath)}`))
      this.log(chalk.green(`Installed projector wrapper in ${shortenHome(result.rcPath)}`))
      this.log(`Run ${chalk.cyan('source ' + shortenHome(result.rcPath))} or open a new shell to apply.`)
    }
  }

  private async removeWrapper(rcPath: string) {
    const begin = '# >>> projector wrapper >>>'
    const end = '# <<< projector wrapper <<<'
    try {
      const original = await fs.readFile(rcPath, 'utf8')
      if (!original.includes(begin)) {
        this.log('No projector wrapper block found; nothing to remove.')
        return
      }
      const backupPath = `${rcPath}.bak-${Date.now()}`
      await fs.copyFile(rcPath, backupPath)
      const updated = original.replace(new RegExp(`${begin}[\s\S]*?${end}`), '').trimEnd() + '\n'
      await fs.writeFile(rcPath, updated, 'utf8')
      this.log(chalk.gray(`Backup created: ${shortenHome(backupPath)}`))
      this.log(chalk.green(`Removed projector wrapper from ${shortenHome(rcPath)}`))
    } catch (e) {
      this.error(`Failed to remove wrapper: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async dryRunInstall(rcPath: string, content: string) {
    const begin = '# >>> projector wrapper >>>'
    const end = '# <<< projector wrapper <<<'
    try {
      const original = await fs.readFile(rcPath, 'utf8')
      const hasBlock = original.includes(begin)
      this.log(chalk.yellow('Dry run: no changes will be made.'))
      this.log(`Target rc: ${chalk.cyan(shortenHome(rcPath))}`)
      this.log(hasBlock ? 'Action: would update existing projector wrapper block.' : 'Action: would append projector wrapper block.')
      this.log('\n----- BEGIN BLOCK -----')
      this.log(`${begin}\n${content}\n${end}`)
      this.log('----- END BLOCK -----\n')
    } catch (e) {
      this.error(`Dry run failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async dryRunRemove(rcPath: string) {
    const begin = '# >>> projector wrapper >>>'
    const end = '# <<< projector wrapper <<<'
    try {
      const original = await fs.readFile(rcPath, 'utf8')
      if (!original.includes(begin)) {
        this.log(chalk.yellow('Dry run: no wrapper block found; nothing to remove.'))
        return
      }
      this.log(chalk.yellow('Dry run: would remove the projector wrapper block from: ') + chalk.cyan(shortenHome(rcPath)))
      const match = original.match(new RegExp(`${begin}[\s\S]*?${end}`))
      if (match) {
        this.log('\n----- BLOCK TO REMOVE -----')
        this.log(match[0])
        this.log('----- END BLOCK -----\n')
      }
    } catch (e) {
      this.error(`Dry run failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
