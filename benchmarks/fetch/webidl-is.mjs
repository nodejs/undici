import { group, bench, run } from 'mitata'
import { webidl } from '../../lib/web/fetch/webidl.js'
import { FormData, Headers } from '../../index.js'

function assert (value) {
  if (!value) {
    throw new TypeError('value is not truthy')
  }
}

const isPrototypeOf = webidl.util.MakeTypeAssertion(FormData.prototype)
const privatePropertyIn = webidl.is.FormData

const fd = new FormData()
const notFd = new Headers()

group(() => {
  bench('common (good) case - isPrototypeOf', () => {
    assert(isPrototypeOf(fd))
  })
  bench('uncommon (bad) case - isPrototypeOf', () => {
    assert(!isPrototypeOf(notFd))
  })
  bench('common (good) case - #symbol in fd', () => {
    assert(privatePropertyIn(fd))
  })
  bench('uncommon (bad) case - #symbol in fd', () => {
    assert(!privatePropertyIn(notFd))
  })
})

await run()
