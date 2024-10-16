import { bench, run, barplot } from 'mitata'
import { Headers, FormData } from '../../index.js'
import { webidl } from '../../lib/web/fetch/webidl.js'

const headers = new Headers()
const fd = new FormData()

barplot(() => {
  bench('webidl.is.FormData (ok)', () => {
    return webidl.is.FormData(fd)
  })

  bench('webidl.is.FormData (bad)', () => {
    return !webidl.is.FormData(headers)
  })

  bench('instanceof (ok)', () => {
    return fd instanceof FormData
  })

  bench('instanceof (bad)', () => {
    return !(headers instanceof FormData)
  })
})

await run()
