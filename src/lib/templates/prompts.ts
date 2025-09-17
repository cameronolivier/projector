import inquirer from 'inquirer'
import * as os from 'os'
import * as path from 'path'
import { TemplateDefinition } from '../types.js'

export async function promptForTemplateId(templates: TemplateDefinition[]): Promise<string> {
  if (templates.length === 0) {
    throw new Error('No templates available. Add templates before running this command.')
  }
  const { templateId } = await inquirer.prompt<{ templateId: string }>([
    {
      type: 'list',
      name: 'templateId',
      message: 'Select a template to apply',
      choices: templates.map((tpl) => ({
        name: `${tpl.name}${tpl.description ? ` — ${tpl.description}` : ''}`,
        value: tpl.id,
      })),
    },
  ])
  return templateId
}

export async function promptForTargetDirectory(defaultDir?: string): Promise<string> {
  const expandedDefault = defaultDir ? defaultDir.replace('~', os.homedir()) : path.join(process.cwd(), 'new-project')
  const { targetDir } = await inquirer.prompt<{ targetDir: string }>([
    {
      type: 'input',
      name: 'targetDir',
      message: 'Where should the template be generated?',
      default: expandedDefault,
      filter: (input: string) => input.replace('~', os.homedir()),
    },
  ])
  return targetDir
}

export async function promptForVariables(
  definition: TemplateDefinition,
  provided: Record<string, string>
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = { ...provided }
  if (!definition.variables || definition.variables.length === 0) {
    return resolved
  }

  const prompts = definition.variables
    .filter((variable) => provided[variable.key] == null)
    .map((variable) => ({
      type: 'input' as const,
      name: variable.key,
      message: variable.prompt,
      default: variable.default,
      validate: (input: string) => {
        if (variable.required && (!input || input.trim().length === 0)) {
          return 'This field is required'
        }
        return true
      },
    }))

  if (prompts.length === 0) {
    return resolved
  }

  const answers = await inquirer.prompt<Record<string, string>>(prompts)
  for (const [key, value] of Object.entries(answers)) {
    resolved[key] = value
  }
  return resolved
}
