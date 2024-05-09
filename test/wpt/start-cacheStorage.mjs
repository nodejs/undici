import { WPTRunner } from './runner/runner.mjs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'
import { on } from 'events'

const serverPath = fileURLToPath(join(import.meta.url, '../server/server.mjs'))

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
child.on('exit', (code) => process.exit(code))

for await (const [message] of on(child, 'message')) {
  if (message.server) {
    const runner = new WPTRunner('service-workers/cache-storage', message.server)
    runner.run()

    runner.once('completion', () => {
      if (child.connected) {
        child.send('shutdown')
      }
    })
  }
}
