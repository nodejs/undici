import { bench, run } from 'mitata'
import { urlHasHttpsScheme } from '../../lib/web/fetch/util.js'

const httpString = 'http://example.com'
const httpObject = { protocol: 'http:' }
const httpsString = 'https://example.com'
const httpsObject = { protocol: 'https:' }

bench('urlHasHttpsScheme "http:" String', () => {
  urlHasHttpsScheme(httpString)
})
bench('urlHasHttpsScheme "https:" String', () => {
  urlHasHttpsScheme(httpsString)
})
bench('urlHasHttpsScheme "http:" Object', () => {
  urlHasHttpsScheme(httpObject)
})
bench('urlHasHttpsScheme "https:" Object', () => {
  urlHasHttpsScheme(httpsObject)
})

await run()
