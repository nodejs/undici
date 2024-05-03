import { fetch } from './index.js'

const server = process.argv.at(-1)
const fmt = new Intl.NumberFormat()
let total = 0
const batch = 50
const delay = 0
let i = 0
const max = 10000 / batch

console.time('fetch')
while (i++ < max) {
  const array = new Array(batch)
  for (let j = 0; j < batch; j++) {
    array[j] = fetch(server)
  }
  await Promise.all(array)
  await new Promise((resolve) => setTimeout(resolve, delay))
  console.log(
    'RSS',
    (process.memoryUsage.rss() / 1024 / 1024) | 0,
    'MB after',
    fmt.format((total += batch)) + ' fetch() requests'
  )
}

console.timeEnd('fetch')
