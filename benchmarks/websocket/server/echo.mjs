import cluster from 'node:cluster'
import { setup, ws } from './../../_util/websocket-simple-server.js'
import { cpus } from 'node:os'

if (cluster.isPrimary) {
  let cpu = cpus().length
  while (cpu-- > 0) {
    cluster.fork()
  }
} else {
  const server = setup({
    onConnection (ctrl) {
      ctrl.onMessage = (data) => {
        ctrl.write(ws.unmask(data.buffer, data.maskKey), data.isBinary)
      }
    },
    parseBody: true
  })

  server.listen(5001)

  cluster.on('exit', () => {
    server.close()
  })
}
