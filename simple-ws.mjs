import { setup, ws } from './benchmarks/_util/websocket-simple-server.js'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'

const __BINARY_SIZE__ = 1024 * 256
const binary = randomBytes(__BINARY_SIZE__)

const frame = ws.createFrame(ws.opcode.BINARY, binary)

const server = setup({
  onConnection (controller) {
    controller.onMessage = () => {
      controller.writeFrame(frame)
    }
  },
  parseBody: false
})

server.listen(5001, '0.0.0.0')

await once(server, 'listening')
