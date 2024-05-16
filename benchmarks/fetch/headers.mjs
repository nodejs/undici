import { bench, group, run } from 'mitata'
import { Headers, getHeadersList } from '../../lib/web/fetch/headers.js'

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function generateAsciiString (length) {
  let result = ''
  for (let i = 0; i < length; ++i) {
    result += characters[Math.floor(Math.random() * charactersLength)]
  }
  return result
}

const settings = {
  'fast-path (tiny array)': 4,
  'fast-path (small array)': 8,
  'fast-path (middle array)': 16,
  'fast-path': 32,
  'slow-path': 64
}

for (const [name, length] of Object.entries(settings)) {
  const headers = new Headers(
    Array.from(Array(length), () => [generateAsciiString(12), ''])
  )

  const headersSorted = new Headers(headers)

  const headersList = getHeadersList(headers)

  const headersListSorted = getHeadersList(headersSorted)

  const kHeadersSortedMap = Reflect.ownKeys(headersList).find(
    (c) => String(c) === 'Symbol(headers map sorted)'
  )

  group(`length ${length} #${name}`, () => {
    bench('Headers@@iterator', () => {
      // prevention of memoization of results
      headersList[kHeadersSortedMap] = null
      return [...headers]
    })

    bench('Headers@@iterator (sorted)', () => {
      // prevention of memoization of results
      headersListSorted[kHeadersSortedMap] = null
      return [...headersSorted]
    })
  })
}

await run()
