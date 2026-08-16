import * as templates from './lib/templates.mjs'
import * as utils from './lib/utils.mjs'

export default {
  name: 'Cache-Control Request Directives',
  id: 'cc-request',
  description: 'These tests check to see if caches respect `Cache-Control` request directives. Note that HTTP does not require them to be supported.',
  spec_anchors: ['cache-request-directive'],
  tests: [
    {
      name: 'Does HTTP cache honor request `Cache-Control: max-age=0` when it holds a fresh response?',
      id: 'ccreq-ma0',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.max-age'],
      requests: [
        templates.fresh({}),
        {
          request_headers: [
            ['Cache-Control', 'max-age=0']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: max-age=1` when it holds a fresh response?',
      id: 'ccreq-ma1',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.max-age'],
      requests: [
        templates.fresh({}),
        {
          request_headers: [
            ['Cache-Control', 'max-age=1']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: max-age` when it holds a fresh but `Age`d response that is not fresh enough?',
      id: 'ccreq-magreaterage',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.max-age'],
      requests: [
        templates.fresh({
          response_headers: [
            ['Age', '1800']
          ]
        }),
        {
          request_headers: [
            ['Cache-Control', 'max-age=600']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache reuse a stale response when request `Cache-Control: max-stale` allows it?',
      id: 'ccreq-max-stale',
      kind: 'check',
      depends_on: ['freshness-max-age-stale'],
      spec_anchors: ['cache-request-directive.max-stale'],
      requests: [
        templates.becomeStale({}),
        {
          request_headers: [
            ['Cache-Control', 'max-stale=1000']
          ],
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache reuse a stale `Age`d response when request `Cache-Control: max-stale` allows it?',
      id: 'ccreq-max-stale-age',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.max-stale'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1500'],
            ['Age', '2000']
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'max-stale=1000']
          ],
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: min-fresh` when the response it holds is not fresh enough?',
      id: 'ccreq-min-fresh',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.min-fresh'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1500']
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'min-fresh=2000']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: min-fresh` when the `Age`d response it holds is not fresh enough?',
      id: 'ccreq-min-fresh-age',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.min-fresh'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1500'],
            ['Age', '1000']
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'min-fresh=1000']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: no-cache` when it holds a fresh response?',
      id: 'ccreq-no-cache',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.no-cache'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600']
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'no-cache']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: no-cache` by validating a response with `Last-Modified`?',
      id: 'ccreq-no-cache-lm',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.no-cache'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['Last-Modified', -10000],
            ['Date', 0]
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'no-cache']
          ],
          expected_type: 'lm_validated'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: no-cache` by validating a response with an `ETag`?',
      id: 'ccreq-no-cache-etag',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.no-cache'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['ETag', `"${utils.httpContent('abc')}"`]
          ],
          setup: true
        },
        {
          request_headers: [
            ['Cache-Control', 'no-cache']
          ],
          expected_type: 'etag_validated'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: no-store` when it holds a fresh response?',
      id: 'ccreq-no-store',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-request-directive.no-store'],
      requests: [
        templates.fresh({}),
        {
          request_headers: [
            ['Cache-Control', 'no-store']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache honour request `Cache-Control: only-if-cached` by generating a `504` response when it does not have a stored response?',
      id: 'ccreq-oic',
      kind: 'check',
      spec_anchors: ['cache-request-directive.only-if-cached'],
      requests: [
        {
          request_headers: [
            ['Cache-Control', 'only-if-cached']
          ],
          expected_status: 504,
          expected_response_text: null
        }
      ]
    }
  ]
}
