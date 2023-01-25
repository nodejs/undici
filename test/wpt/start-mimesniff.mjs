import { WPTRunner } from './runner/runner/runner.mjs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'
import { on } from 'events'

const serverPath = fileURLToPath(join(import.meta.url, '../server/server.mjs'))

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

for await (const [message] of on(child, 'message')) {
  if (message.server) {
    const runner = new WPTRunner('mimesniff', message.server)
    runner.run()

    runner.once('completion', () => {
      if (child.connected) {
        child.send('shutdown')
      } else {
        process.exit()
      }
    })
  } else if (message.message === 'shutdown') {
    process.exit()
  }
}
