import undici from './index.js'
import fs from 'fs'

await undici.stream(
  'https://api.github.com/notfound',
  { throwOnError: true },
  () => fs.createWriteStream('response.txt')
)
