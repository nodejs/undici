import * as templates from './lib/templates.mjs'
import * as utils from './lib/utils.mjs'
import headerList from './lib/header-list.mjs'

const tests = []

tests.push({
  name: '`Connection` header must inhibit a HTTP cache from storing listed headers',
  id: 'headers-omit-headers-listed-in-Connection',
  kind: 'required',
  depends_on: ['freshness-max-age'],
  requests: [
    templates.fresh({
      response_headers: [
        ['Connection', 'a, b', false],
        ['a', '1', false],
        ['b', '2', false],
        ['c', '3', false]
      ]
    }),
    {
      expected_type: 'cached',
      expected_response_headers: [['c', '3']],
      expected_response_headers_missing: ['a', 'b'],
      setup_tests: ['expected_type', 'expected_response_headers']
    }
  ]
})

function checkStoreHeader (config) {
  const id = `store-${config.name}`
  const value = 'valB' in config ? config.valB : utils.httpContent(`${config.name}-store-value`)
  const storeHeader = 'noStore' in config ? !config.noStore : true
  const requirement = storeHeader ? 'must' : 'must not'
  const expectedHeaders = storeHeader ? [[config.name, value]] : []
  const unexpectedHeaders = storeHeader ? [] : [[config.name, value]]

  const respHeaders = [
    ['Date', 0],
    [config.name, value, storeHeader]
  ]
  if (config.name !== 'Cache-Control') {
    respHeaders.push(['Cache-Control', 'max-age=3600'])
  }

  tests.push({
    name: `HTTP cache ${requirement} store \`${config.name}\` header field`,
    id: `headers-${id}`,
    kind: 'required',
    depends_on: ['freshness-max-age'],
    requests: [
      {
        response_headers: respHeaders,
        setup: true,
        pause_after: true,
        check_body: 'checkBody' in config ? config.checkBody : true
      },
      {
        expected_type: 'cached',
        expected_response_headers: expectedHeaders,
        expected_response_headers_missing: unexpectedHeaders,
        setup_tests: ['expected_type'],
        check_body: 'checkBody' in config ? config.checkBody : true
      }
    ]
  })
}

headerList.forEach(checkStoreHeader)

export default {
  name: 'Storing Header Fields',
  id: 'headers',
  description: 'These tests examine how caches store headers in responses.',
  spec_anchors: ['storing.fields'],
  tests
}
