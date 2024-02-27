import { bench, group, run } from 'mitata'
import { isValidSubprotocol } from '../../lib/web/websocket/util.js'

const valid = 'valid'
const invalid = 'invalid '

group('isValidSubprotocol', () => {
  bench(`valid: ${valid}`, () => {
    return isValidSubprotocol(valid)
  })

  bench(`invalid: ${invalid}`, () => {
    return isValidSubprotocol(invalid)
  })
})

await run()
