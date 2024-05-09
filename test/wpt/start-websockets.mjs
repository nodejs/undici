import { WPTRunner } from './runner/runner.mjs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { fork } from 'child_process'
import { on } from 'events'

const { WPT_REPORT } = process.env

function isGlobalAvailable () {
  if (typeof WebSocket !== 'undefined') {
    return true
  }

  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(v => Number(v))

  // TODO: keep this up to date when backports to earlier majors happen
  return nodeMajor >= 21 || (nodeMajor === 20 && nodeMinor >= 10)
}

if (process.env.CI) {
  // TODO(@KhafraDev): figure out *why* these tests are flaky in the CI.
  // process.exit(0)
}

const serverPath = fileURLToPath(join(import.meta.url, '../server/websocket.mjs'))

const child = fork(serverPath, [], {
  stdio: ['pipe', 'pipe', 'pipe', 'ipc']
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)
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
