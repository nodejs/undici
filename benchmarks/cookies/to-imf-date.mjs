import { bench, group, run } from 'mitata'
import { toIMFDate } from '../../lib/web/cookies/util.js'

const date = new Date()

group('toIMFDate', () => {
  bench(`toIMFDate: ${date}`, () => {
    return toIMFDate(date)
  })
})

await run()
