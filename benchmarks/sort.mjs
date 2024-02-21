import { bench, group, run } from 'mitata'
import { sort, heapSort, introSort } from '../lib/web/fetch/sort.js'

function compare (a, b) {
  return a < b ? -1 : 1
}

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
  tiny: 32,
  small: 64,
  middle: 128,
  large: 512
}

for (const [name, length] of Object.entries(settings)) {
  group(`sort (${name})`, () => {
    const array = Array.from(new Array(length), () => generateAsciiString(12))
    // sort(array, compare)
    bench('Array#sort', () => array.slice().sort(compare))
    bench('sort (intro sort)', () => sort(array.slice(), compare))

    // sort(array, start, end, compare)
    bench('intro sort', () => introSort(array.slice(), 0, array.length, compare))
    bench('heap sort', () => heapSort(array.slice(), 0, array.length, compare))
  })

  group(`sort sortedArray (${name})`, () => {
    const array = Array.from(new Array(length), () => generateAsciiString(12)).sort(compare)
    // sort(array, compare)
    bench('Array#sort', () => array.sort(compare))
    bench('sort (intro sort)', () => sort(array, compare))

    // sort(array, start, end, compare)
    bench('intro sort', () => introSort(array, 0, array.length, compare))
    bench('heap sort', () => heapSort(array, 0, array.length, compare))
  })
}

await run()
