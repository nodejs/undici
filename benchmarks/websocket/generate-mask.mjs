import { randomFillSync, randomBytes } from 'node:crypto'
import { bench, group, run } from 'mitata'

const BUFFER_SIZE = 16384

const buf = Buffer.allocUnsafe(BUFFER_SIZE)
let bufIdx = BUFFER_SIZE

function generateMask () {
  if (bufIdx === BUFFER_SIZE) {
    bufIdx = 0
    randomFillSync(buf, 0, BUFFER_SIZE)
  }
  return [buf[bufIdx++], buf[bufIdx++], buf[bufIdx++], buf[bufIdx++]]
}

group('generate', () => {
  bench('generateMask', () => generateMask())
  bench('crypto.randomBytes(4)', () => randomBytes(4))
})

await run()
