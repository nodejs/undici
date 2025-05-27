const fs = require('fs')
const path = require('path')
const util = require('util')

// Create log directory
const LOG_DIR = path.join(__dirname, 'logs')
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR)
}

// Log file path
const LOG_FILE = path.join(LOG_DIR, `test-${new Date().toISOString().replace(/:/g, '-')}.log`)

// Create write stream
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' })

// Async logger
class AsyncLogger {
  constructor () {
    this.queue = []
    this.isProcessing = false

    // Write logs from queue to file every second
    setInterval(() => this.processQueue(), 1000)

    // Ensure all logs are written when process exits
    process.on('exit', () => {
      this.processQueueSync()
    })
  }

  // Format log message
  formatMessage (level, message, ...args) {
    const timestamp = new Date().toISOString()
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        return util.inspect(arg, { depth: null })
      }
      return arg
    }).join(' ')

    return `[${timestamp}] [${level}] ${message} ${formattedArgs}`.trim()
  }

  // Add log to queue
  log (level, message, ...args) {
    const formattedMessage = this.formatMessage(level, message, ...args)

    // Output to console
    if (level === 'ERROR') {
      console.error(formattedMessage)
    } else if (level === 'WARN') {
      console.warn(formattedMessage)
    } else {
      console.log(formattedMessage)
    }

    // Add to queue
    this.queue.push(formattedMessage)

    // Start processing if queue is not already being processed
    if (!this.isProcessing) {
      this.processQueue()
    }
  }

  // Process queue asynchronously
  async processQueue () {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true

    try {
      const messagesToProcess = [...this.queue]
      this.queue = []

      // Write to file
      for (const message of messagesToProcess) {
        logStream.write(message + '\n')
      }
    } finally {
      this.isProcessing = false

      // Continue processing if queue still has messages
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue())
      }
    }
  }

  // Process queue synchronously (used when process exits)
  processQueueSync () {
    if (this.queue.length === 0) return

    const messagesToProcess = [...this.queue]
    this.queue = []

    for (const message of messagesToProcess) {
      fs.appendFileSync(LOG_FILE, message + '\n')
    }
  }

  // Public methods
  info (message, ...args) {
    this.log('INFO', message, ...args)
  }

  warn (message, ...args) {
    this.log('WARN', message, ...args)
  }

  error (message, ...args) {
    this.log('ERROR', message, ...args)
  }

  debug (message, ...args) {
    this.log('DEBUG', message, ...args)
  }
}

// Export instance and set as global variable
const logger = new AsyncLogger()
global.__asyncLogger = logger

module.exports = logger
