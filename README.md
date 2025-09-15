# Projector

Smart CLI for discovering and managing development projects with scoring-based root detection, monorepo awareness, and docs-first project support.

- CLI entry: `src/index.ts` (default command: `list`)
- Build: `pnpm build` (outputs to `dist/`)
- Dev: `pnpm dev -- --depth 3 --verbose`

## Configuration
- Config file: `~/.config/projector/config.yaml`
- See full options and defaults in `docs/config.md`.

Quick start:
```sh
pnpm install
pnpm dev -- --directory ~/dev --depth 3
```

## Usage
- Print merged configuration (YAML):
```sh
projector config --print
```

- Show config file path:
```sh
projector config --path
```

- List projects (default command):
```sh
projector              # same as: projector list
projector list --depth 5 --verbose
projector list --select --path-only   # interactively pick and print path
```

- Jump to a project (print path or a cd command):
```sh
projector jump --select
projector jump --name api
projector jump --select --print-cd     # emits: cd "<path>"
```

- Open a project in your editor:
```sh
projector open --select --editor code --wait
projector open --name web --editor webstorm
projector open --select --dry-run       # prints the command only
```

## Interactive Actions and cd-in-place
When run in a TTY, `projector` can show the table, then prompt to select a project and an action (open in editor, change directory, or print path). Changing the caller shell’s directory requires a tiny wrapper:

```sh
# bash/zsh wrapper: put in your shell rc (e.g., ~/.zshrc)
function projector() {
  local out
  out="$(command projector "$@")" || return
  if [[ "$out" == __PROJECTOR_CD__* ]]; then
    cd "${out#__PROJECTOR_CD__ }"
  else
    printf '%s\n' "$out"
  fi
}
```

Now just run `projector`, pick a project, choose “Change directory”, and your shell will cd to it.

You can also manage the wrapper via the built-in command:

```sh
# Install or update wrapper into detected rc file
projector shell --install

# Print changes without modifying files
projector shell --install --dry-run

# Remove the wrapper block
projector shell --remove

# Override shell kind detection
projector shell --install --shell fish
```

Fish and PowerShell examples:

```fish
# fish: add to ~/.config/fish/config.fish
function projector; set out (command projector $argv);
  if test (string match -q "__PROJECTOR_CD__*" -- $out);
    set p (string split -m1 "__PROJECTOR_CD__ " -- $out)[2];
    cd $p;
  else;
    printf "%s\n" $out;
  end;
end
```

```powershell
# PowerShell: add to your profile
function projector {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Args)
  $exe = (Get-Command projector -CommandType Application -ErrorAction SilentlyContinue)
  if (-not $exe) { Write-Error "projector binary not found on PATH"; return }
  $out = & $exe.Source @Args
  if ($LASTEXITCODE -ne 0) { return $LASTEXITCODE }
  if ($null -ne $out -and $out -is [array]) { $out = $out -join "`n" }
  $sentinel = '__PROJECTOR_CD__ '
  $idx = $out.LastIndexOf($sentinel)
  if ($idx -ge 0) {
    $path = $out.Substring($idx + $sentinel.Length).Trim()
    if ($path) { Set-Location $path; return }
  }
  if ($null -ne $out) { Write-Output $out }
}

# First-time note: you may need to allow your profile to run
# Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Precedence and prompts:
- `--select` performs a simple interactive pick-and-print of a path. In a TTY, the new interactive action flow may still run afterward if enabled by gating. Use `--no-interactive` to suppress the action flow when pairing with `--select`.
- `--interactive` forces the action flow even if defaults or TTY detection would skip it; `--no-interactive` disables it.
- Tip: For legacy behavior only, run `projector --select --no-interactive`. For the new flow only, just run `projector` (in a TTY) or add `--interactive`.

## Docs
- Architecture: `docs/architecture.md`
- Testing: `docs/TESTING.md`
- Configuration: `docs/config.md`
