import { WPTRunner } from './runner/runner.mjs'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'
import { on } from 'events'

const { WPT_REPORT } = process.env

const serverPath = fileURLToPath(new URL('../server/server.mjs', import.meta.url))

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
child.on('exit', (code) => process.exit(code))

for await (const [message] of on(child, 'message')) {
  if (message.server) {
    const runner = new WPTRunner('fetch', message.server, {
      appendReport: !!WPT_REPORT,
      reportPath: WPT_REPORT
    })
    runner.run()

    runner.once('completion', () => {
      if (child.connected) {
        child.send('shutdown')
      }
    })
  }
}
