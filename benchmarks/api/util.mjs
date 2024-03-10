import { bench, group, run } from 'mitata'
import { isContentTypeText, isContentTypeApplicationJson } from '../../lib/api/util.js'

const html = 'text/html'
const json = 'application/json; charset=UTF-8'

group('isContentTypeText', () => {
  bench(`isContentTypeText('${html}')`, () => {
    return isContentTypeText(html)
  })
  bench(`isContentTypeText('${json}')`, () => {
    return isContentTypeText(json)
  })
  bench('html.startsWith(\'text/\')', () => {
    return html.startsWith('text/')
  })
  bench('json.startsWith(\'text/\')', () => {
    return json.startsWith('text/')
  })
})

group('isContentTypeApplicationJson', () => {
  bench(`isContentTypeApplicationJson('${html}')`, () => {
    return isContentTypeApplicationJson(html)
  })
  bench(`isContentTypeApplicationJson('${json}')`, () => {
    return isContentTypeApplicationJson(json)
  })
  bench('html.startsWith(\'application/json\')', () => {
    return html.startsWith('application/json')
  })
  bench('json.startsWith(\'application/json\')', () => {
    return json.startsWith('application/json')
  })
})

await run()
