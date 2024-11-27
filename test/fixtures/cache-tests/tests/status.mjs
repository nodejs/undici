import * as templates from './lib/templates.mjs'
import * as utils from './lib/utils.mjs'

const tests = []

function checkStatus (status) {
  const code = status[0]
  const phrase = status[1]
  let body = status[2]
  if (body === undefined) {
    body = utils.httpContent(code)
  }
  const is3xx = code > 299 && code < 400
  tests.push({
    name: 'An optimal HTTP cache reuses a fresh `' + code + '` response with explict freshness',
    id: `status-${code}-fresh`,
    kind: 'optimal',
    depends_on: ['freshness-max-age'],
    browser_skip: is3xx,
    requests: [
      templates.fresh({
        response_status: [code, phrase],
        response_body: body,
        redirect: 'manual'
      }), {
        expected_type: 'cached',
        response_status: [code, phrase],
        redirect: 'manual',
        response_body: body
      }
    ]
  })
  tests.push({
    name: 'HTTP cache must not reuse a stale `' + code + '` response with explicit freshness',
    id: `status-${code}-stale`,
    depends_on: [`status-${code}-fresh`],
    browser_skip: is3xx,
    requests: [
      templates.stale({
        response_status: [code, phrase],
        response_body: body,
        redirect: 'manual',
        setup: true
      }), {
        expected_type: 'not_cached',
        redirect: 'manual',
        response_body: body
      }
    ]
  })
}
[
  [200, 'OK'],
  [203, 'Non-Authoritative Information'],
  [204, 'No Content', null],
  [299, 'Whatever'],
  [301, 'Moved Permanently'],
  [302, 'Found'],
  [303, 'See Other'],
  [307, 'Temporary Redirect'],
  [308, 'Permanent Redirect'],
  [400, 'Bad Request'],
  [404, 'Not Found'],
  [410, 'Gone'],
  [499, 'Whatever'],
  [500, 'Internal Server Error'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
  [599, 'Whatever']
].forEach(checkStatus)

tests.push({
  name: 'HTTP cache must not reuse a fresh response with an unrecognised status code and `Cache-Control: no-store, must-understand`',
  id: 'status-599-must-understand',
  depends_on: ['status-599-fresh'],
  spec_anchors: ['cache-response-directive.must-understand'],
  requests: [
    {
      response_status: [599, 'Whatever'],
      response_headers: [
        ['Cache-Control', 'max-age=3600, no-store, must-understand']
      ],
      setup: true
    },
    {
      expected_type: 'not_cached'
    }
  ]
})

tests.push({
  name: 'An optimal HTTP cache reuses a fresh response with a recognised status code and `Cache-Control: no-store, must-understand`',
  id: 'status-200-must-understand',
  kind: 'optimal',
  depends_on: ['status-200-fresh', 'cc-resp-no-store-fresh'],
  spec_anchors: ['cache-response-directive.must-understand'],
  requests: [
    {
      response_status: [200, 'OK'],
      response_headers: [
        ['Cache-Control', 'max-age=3600, no-store, must-understand']
      ],
      setup: true
    },
    {
      expected_type: 'cached'
    }
  ]
})

export default {
  name: 'Status Code Cacheability',
  id: 'status',
  description: 'These tests check to see if a cache will store and reuse various status codes when they have explicit freshness information associated with them.',
  spec_anchors: ['response.cacheability'],
  tests
}
