const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const DEFAULT_INTERVAL = 80

export class Spinner {
  private frameIndex = 0
  private timer?: NodeJS.Timeout
  private message: string
  private running = false
  private readonly enabled: boolean

  constructor(initialMessage: string, private readonly stream: NodeJS.WriteStream = process.stdout) {
    this.message = initialMessage
    this.enabled = Boolean(this.stream.isTTY)
  }

  start(): void {
    if (!this.enabled || this.running) {
      return
    }

    this.running = true
    this.render()
    this.timer = setInterval(() => this.render(), DEFAULT_INTERVAL)
  }

  setMessage(message: string): void {
    this.message = message
    if (!this.running || !this.enabled) {
      return
    }
    this.render(true)
  }

  succeed(message?: string): void {
    if (!this.enabled) {
      return
    }
    this.stop()
    if (message) {
      this.stream.write(`✔ ${message}\n`)
    }
  }

  fail(message?: string): void {
    if (!this.enabled) {
      return
    }
    this.stop()
    if (message) {
      this.stream.write(`✖ ${message}\n`)
    }
  }

  stop(): void {
    if (!this.running) {
      return
    }
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.clearLine()
  }

  private render(force = false): void {
    if (!this.enabled) {
      return
    }
    if (!force) {
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length
    }
    const frame = FRAMES[this.frameIndex]
    this.clearLine()
    this.stream.write(`${frame} ${this.message}`)
  }

  private clearLine(): void {
    if (!this.enabled) {
      return
    }
    this.stream.write('\r\x1b[K')
  }
}
