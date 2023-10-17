import { WPTRunner } from './runner/runner.mjs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'
import { on } from 'events'
import options from 'internal/options'

const { WPT_REPORT } = process.env

function isGlobalAvailable () {
  if (typeof WebSocket !== 'undefined') {
    return true
  }

  return typeof options.getOptionValue('--experimental-websocket') === 'boolean'
}

if (process.env.CI) {
  // TODO(@KhafraDev): figure out *why* these tests are flaky in the CI.
  // process.exit(0)
}

const serverPath = fileURLToPath(join(import.meta.url, '../server/websocket.mjs'))

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

child.on('exit', (code) => process.exit(code))

for await (const [message] of on(child, 'message')) {
  if (message.server) {
    const runner = new WPTRunner('websockets', message.server, {
      appendReport: !!WPT_REPORT && isGlobalAvailable(),
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
