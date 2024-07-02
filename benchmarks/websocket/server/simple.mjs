import cluster from 'node:cluster'
import { setup, ws } from '../../_util/websocket-simple-server.js'
import { cpus } from 'node:os'

if (cluster.isPrimary) {
  let cpu = cpus().length
  while (cpu-- > 0) {
    cluster.fork()
  }
} else {
  const emptyFrame = ws.createFrame(ws.opcode.BINARY, Buffer.allocUnsafe(0))

  const server = setup({
    onConnection (ctrl) {
      ctrl.onMessage = () => {
        ctrl.writeFrame(emptyFrame)
      }
    },
    parseBody: false
  })

  server.listen(5001)

  cluster.on('exit', () => {
    server.close()
  })
}
