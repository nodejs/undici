import * as templates from './lib/templates.mjs'

export default {
  name: 'Conditional Requests: If-Modified-Since and Last-Modified',
  id: 'conditional-lm',
  description: 'These tests check handling of conditional requests using `If-Modified-Since` and `Last-Modified`.',
  spec_anchors: ['validation.model'],
  tests: [
    {
      name: 'An optimal HTTP cache responds to `If-Modified-Since` with a `304` when holding a fresh response with a matching `Last-Modified`',
      id: 'conditional-lm-fresh',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['Last-Modified', -3000]
          ]
        }),
        {
          request_headers: [
            ['If-Modified-Since', -3000]
          ],
          magic_ims: true,
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-Modified-Since` with a `304` when holding a fresh response with an earlier `Last-Modified`',
      id: 'conditional-lm-fresh-earlier',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['Last-Modified', -3000]
          ]
        }),
        {
          request_headers: [
            ['If-Modified-Since', -2000]
          ],
          magic_ims: true,
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-Modified-Since` with a `304` when holding a stale response with a matching `Last-Modified`, after validation',
      id: 'conditional-lm-stale',
      kind: 'optimal',
      depends_on: ['freshness-max-age-stale'],
      browser_skip: true,
      requests: [
        templates.becomeStale({
          response_headers: [
            ['Last-Modified', -3000]
          ]
        }),
        {
          request_headers: [
            ['If-Modified-Since', -3000]
          ],
          magic_ims: true,
          expected_type: 'lm_validated',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-Modified-Since` with a `304` when holding a newer fresh response with no `Last-Modified`',
      id: 'conditional-lm-fresh-no-lm',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({}),
        {
          request_headers: [
            ['If-Modified-Since', -3000]
          ],
          magic_ims: true,
          expected_type: 'cached',
          expected_status: 304,
          setup_tests: ['expected_type']
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-Modified-Since` with a `304` when holding a newer fresh response when IMS uses an equivalent rfc850 date',
      id: 'conditional-lm-fresh-rfc850',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['Last-Modified', -3000]
          ]
        }),
        {
          request_headers: [
            ['If-Modified-Since', -3000]
          ],
          magic_ims: true,
          rfc850date: ['if-modified-since'],
          expected_type: 'cached',
          expected_status: 304,
          setup_tests: ['expected_type']
        }
      ]
    }
  ]
}
