import { bench, group, run } from 'mitata'
import { tree } from '../../lib/core/tree.js'

const contentLength = Buffer.from('Content-Length')
const contentLengthUpperCase = Buffer.from('Content-Length'.toUpperCase())
const contentLengthLowerCase = Buffer.from('Content-Length'.toLowerCase())

group('tree.search', () => {
  bench('content-length', () => {
    tree.lookup(contentLengthLowerCase)
  })
  bench('CONTENT-LENGTH', () => {
    tree.lookup(contentLengthUpperCase)
  })
  bench('Content-Length', () => {
    tree.lookup(contentLength)
  })
})

await run()
