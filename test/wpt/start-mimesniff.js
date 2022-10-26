const { WPTRunner } = require('./runner/runner/runner.js')
const { join } = require('path')
const { fork } = require('child_process')
const { on } = require('events')

const serverPath = join(__dirname, 'server/server.js')

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

;(async () => {
  for await (const [message] of on(child, 'message')) {
    if (message.server) {
      const runner = new WPTRunner('mimesniff', message.server)
      runner.run()

      runner.once('completion', () => {
        child.send('shutdown')
      })
    } else if (message.message === 'shutdown') {
      process.exit()
    }
  }
})()
