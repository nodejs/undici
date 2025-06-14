import { randomBytes } from 'node:crypto'
import { bench, summary, run } from 'mitata'
import { generateMask } from '../../lib/web/websocket/frame.js'

summary(() => {
  bench('generateMask', () => generateMask())
  bench('crypto.randomBytes(4)', () => randomBytes(4))
})

await run()
