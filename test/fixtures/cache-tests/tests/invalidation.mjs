import { makeTemplate, fresh } from './lib/templates.mjs'

const contentLocation = makeTemplate({
  filename: 'content_location_target',
  response_headers: [
    ['Cache-Control', 'max-age=100000'],
    ['Last-Modified', 0],
    ['Date', 0]
  ]
})

const location = makeTemplate({
  filename: 'location_target',
  response_headers: [
    ['Cache-Control', 'max-age=100000'],
    ['Last-Modified', 0],
    ['Date', 0]
  ]
})

const lclResponse = makeTemplate({
  response_headers: [
    ['Location', 'location_target'],
    ['Content-Location', 'content_location_target']
  ],
  magic_locations: true
})

const tests = []

function checkInvalidation (method) {
  tests.push({
    name: `HTTP cache must invalidate the URL after a successful response to a \`${method}\` request`,
    id: `invalidate-${method}`,
    depends_on: ['freshness-max-age'],
    requests: [
      fresh({}), {
        request_method: method,
        request_body: 'abc',
        setup: true
      }, {
        expected_type: 'not_cached'
      }
    ]
  })
  tests.push({
    name: `An optimal HTTP cache does not invalidate the URL after a failed response to a \`${method}\` request`,
    id: `invalidate-${method}-failed`,
    kind: 'optimal',
    depends_on: [`invalidate-${method}`],
    requests: [
      fresh({}), {
        request_method: method,
        request_body: 'abc',
        response_status: [500, 'Internal Server Error'],
        setup: true
      }, {
        expected_type: 'cached'
      }
    ]
  })
}

function checkLocationInvalidation (method) {
  tests.push({
    name: `Does HTTP cache invalidate \`Location\` URL after a successful response to a \`${method}\` request?`,
    id: `invalidate-${method}-location`,
    kind: 'check',
    depends_on: [`invalidate-${method}`],
    requests: [
      location({
        setup: true
      }), lclResponse({
        request_method: method,
        request_body: 'abc',
        setup: true
      }), location({
        expected_type: 'not_cached'
      })
    ]
  })
}

function checkClInvalidation (method) {
  tests.push({
    name: `Does HTTP cache must invalidate \`Content-Location\` URL after a successful response to a \`${method}\` request?`,
    id: `invalidate-${method}-cl`,
    kind: 'check',
    depends_on: [`invalidate-${method}`],
    requests: [
      contentLocation({
        setup: true
      }), lclResponse({
        request_method: method,
        request_body: 'abc',
        setup: true
      }), contentLocation({
        expected_type: 'not_cached'
      })
    ]
  })
}

const methods = [
  'POST',
  'PUT',
  'DELETE',
  'M-SEARCH'
]

methods.forEach(checkInvalidation)
methods.forEach(checkLocationInvalidation)
methods.forEach(checkClInvalidation)

export default {
  name: 'Cache Invalidation',
  id: 'invalidation',
  description: 'These tests check how caches support  invalidation, including when it is triggered by the `Location` and `Content-Location` response headers.',
  spec_anchors: ['invalidation'],
  tests
}
