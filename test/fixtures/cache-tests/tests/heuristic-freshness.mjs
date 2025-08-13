import * as utils from './lib/utils.mjs'

const tests = []

function checkStatus (status) {
  const succeed = status[0]
  const code = status[1]
  const phrase = status[2]
  let body = status[3]
  if (body === undefined) {
    body = utils.httpContent(code)
  }
  const extra = status[4] || ''
  const extraHdr = status[5]
  const specAnchors = status[6] || []
  let expectedType = 'not_cached'
  let desired = 'HTTP cache must not reuse'
  if (succeed === true) {
    expectedType = 'cached'
    desired = 'An optimal HTTP cache should reuse'
  }
  const responseHeaders = [
    ['Last-Modified', -24 * 60 * 60],
    ['Date', 0]
  ]
  if (extraHdr) {
    responseHeaders.push(extraHdr)
  }
  tests.push({
    name: `${desired} a \`${code} ${phrase}\` response with \`Last-Modified\` based upon heuristic freshness ${extra}`,
    id: `heuristic-${code}-${expectedType}`,
    kind: succeed ? 'optimal' : 'required',
    spec_anchors: specAnchors,
    requests: [{
      response_status: [code, phrase],
      response_headers: responseHeaders,
      response_body: body,
      setup: true
    }, {
      expected_type: expectedType,
      response_status: [code, phrase],
      response_body: body
    }]
  })
}

[
  [true, 200, 'OK'],
  [false, 201, 'Created'],
  [false, 202, 'Accepted'],
  [true, 203, 'Non-Authoritative Information'],
  [true, 204, 'No Content', null],
  [false, 403, 'Forbidden'],
  [true, 404, 'Not Found'],
  [true, 405, 'Method Not Allowed'],
  [true, 410, 'Gone'],
  [true, 414, 'URI Too Long'],
  [true, 501, 'Not Implemented'],
  [false, 502, 'Bad Gateway'],
  [false, 503, 'Service Unavailable'],
  [false, 504, 'Gateway Timeout'],
  [false, 599, 'Unknown', undefined, 'when `Cache-Control: public` is not present', undefined, ['cache-response-directive.public']],
  [true, 599, 'Unknown', undefined, 'when `Cache-Control: public` is present', ['Cache-Control', 'public'], ['cache-response-directive.public']]
].forEach(checkStatus)

function checkHeuristic (delta) {
  tests.push({
    name: `Does HTTP cache consider a \`Last-Modified\` ${delta} seconds ago heuristically fresh?`,
    id: `heuristic-delta-${delta}`,
    kind: 'check',
    requests: [{
      response_headers: [
        ['Last-Modified', -delta],
        ['Date', 0]
      ],
      setup: true,
      pause_after: true
    },
    {
      expected_type: 'cached'
    }]
  })
}

[
  5, 10, 30, 60, 300, 600, 1200, 1800, 3600, 3600 * 12, 3600 * 24
].forEach(checkHeuristic)

export default {
  name: 'Heuristic Freshness',
  id: 'heuristic',
  description: 'These tests check how caches handle heuristic freshness.',
  spec_anchors: ['heuristic.freshness'],
  tests
}
