import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn } from 'child_process'
import { TemplateDefinition } from '../types.js'
import { ResolvedTemplate } from './manager.js'

export interface TemplateRenderOptions {
  force?: boolean
  skipPostCommands?: boolean
  dryRun?: boolean
  variables?: Record<string, string>
}

export interface TemplateRenderResult {
  filesWritten: string[]
  commandsRun: string[]
  metadataPath?: string
}

export class TemplateRenderer {
  constructor(private runCommandImpl: (cmd: string, cwd: string) => Promise<void> = defaultRunCommand) {}

  async render(template: ResolvedTemplate, targetDir: string, options: TemplateRenderOptions = {}): Promise<TemplateRenderResult> {
    const variables = this.prepareVariables(template.definition, options.variables || {})
    const resolvedTarget = path.resolve(targetDir)
    const result: TemplateRenderResult = { filesWritten: [], commandsRun: [] }
    let createdTargetDir = false

    try {
      const exists = await this.pathExists(resolvedTarget)
      if (!exists) {
        if (!options.dryRun) {
          await fs.mkdir(resolvedTarget, { recursive: true })
        }
        createdTargetDir = true
      } else {
        const contents = await fs.readdir(resolvedTarget)
        if (contents.length > 0 && !options.force) {
          throw new Error(`Target directory ${resolvedTarget} is not empty. Use --force to overwrite.`)
        }
      }

      await this.copyTemplateTree(template.sourceDir, resolvedTarget, variables, result, options.dryRun === true)

      if (!options.dryRun) {
        const metadata = {
          templateId: template.definition.id,
          appliedAt: new Date().toISOString(),
          variables,
        }
        const metadataPath = path.join(resolvedTarget, '.projector-template.json')
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8')
        result.metadataPath = metadataPath
        result.filesWritten.push(metadataPath)
      }

      if (!options.skipPostCommands && template.definition.postCommands && template.definition.postCommands.length > 0) {
        for (const command of template.definition.postCommands) {
          if (!options.dryRun) {
            await this.runCommandImpl(command, resolvedTarget)
          }
          result.commandsRun.push(command)
        }
      }

      return result
    } catch (error) {
      if (!options.dryRun && createdTargetDir) {
        await fs.rm(resolvedTarget, { recursive: true, force: true })
      }
      throw error
    }
  }

  private async copyTemplateTree(
    sourceDir: string,
    targetDir: string,
    variables: Record<string, string>,
    result: TemplateRenderResult,
    dryRun: boolean
  ) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      const templatedName = this.applyVariablesToString(entry.name, variables)
      const sourcePath = path.join(sourceDir, entry.name)
      const targetPath = path.join(targetDir, templatedName)

      if (entry.isDirectory()) {
        if (!dryRun) {
          await fs.mkdir(targetPath, { recursive: true })
        }
        await this.copyTemplateTree(sourcePath, targetPath, variables, result, dryRun)
      } else if (entry.isSymbolicLink()) {
        // Skip symbolic links for safety
        continue
      } else {
        await this.copyTemplateFile(sourcePath, targetPath, variables, result, dryRun)
      }
    }
  }

  private async copyTemplateFile(
    sourcePath: string,
    targetPath: string,
    variables: Record<string, string>,
    result: TemplateRenderResult,
    dryRun: boolean
  ) {
    const buffer = await fs.readFile(sourcePath)
    if (isBinary(buffer)) {
      if (!dryRun) {
        await fs.writeFile(targetPath, buffer)
      }
      result.filesWritten.push(targetPath)
      return
    }

    const content = buffer.toString('utf8')
    const substituted = this.applyVariablesToString(content, variables)
    if (!dryRun) {
      await fs.writeFile(targetPath, substituted, 'utf8')
    }
    result.filesWritten.push(targetPath)
  }

  private prepareVariables(definition: TemplateDefinition, provided: Record<string, string>): Record<string, string> {
    const finalVars: Record<string, string> = { ...provided }
    if (definition.variables) {
      for (const variable of definition.variables) {
        if (finalVars[variable.key] == null) {
          if (variable.default != null) {
            finalVars[variable.key] = variable.default
          } else if (variable.required) {
            throw new Error(`Missing required variable: ${variable.key}`)
          } else {
            finalVars[variable.key] = ''
          }
        }
      }
    }
    return finalVars
  }

  private applyVariablesToString(input: string, variables: Record<string, string>): string {
    let output = input
    output = output.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '')
    output = output.replace(/__([A-Za-z0-9_]+)__/g, (_, key: string) => variables[key] ?? '')
    output = output.replace(/\$\{(\w+)\}/g, (_, key: string) => variables[key] ?? '')
    return output
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await fs.access(target)
      return true
    } catch {
      return false
    }
  }
}

function defaultRunCommand(command: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed (${code}): ${command}`))
      }
    })
  })
}

function isBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 1024)
  for (let i = 0; i < len; i += 1) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}
