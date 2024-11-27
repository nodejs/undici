export default

{
  name: 'Expires Freshness',
  id: 'expires',
  description: 'These tests check how caches calculate freshness using `Expires`.',
  spec_anchors: ['expiration.model', 'field.expires'],
  tests: [
    {
      name: 'An optimal HTTP cache reuses a response with a future `Expires`',
      id: 'freshness-expires-future',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Expires', 30 * 24 * 60 * 60],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response with a past `Expires`',
      id: 'freshness-expires-past',
      depends_on: ['freshness-expires-future'],
      requests: [
        {
          response_headers: [
            ['Expires', -30 * 24 * 60 * 60],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response with a present `Expires`',
      id: 'freshness-expires-present',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Expires', 0],
            ['Date', 0]
          ],
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response with an `Expires` older than `Date`, both fast',
      id: 'freshness-expires-old-date',
      depends_on: ['freshness-expires-future'],
      requests: [
        {
          response_headers: [
            ['Expires', 300],
            ['Date', 400]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response with an invalid `Expires` (0)',
      id: 'freshness-expires-invalid',
      depends_on: ['freshness-expires-future'],
      requests: [
        {
          response_headers: [
            ['Expires', '0', false],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'An optimal HTTP cache reuses a response with `Expires`, even if `Date` is invalid',
      id: 'freshness-expires-invalid-date',
      depends_on: ['freshness-expires-future'],
      kind: 'optimal',
      requests: [
        {
          response_headers: [
            ['Date', 'foo', false],
            ['Expires', 10]
          ],
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response when the `Age` header is greater than its `Expires` minus `Date`, and `Date` is slow',
      id: 'freshness-expires-age-slow-date',
      depends_on: ['freshness-expires-future'],
      requests: [
        {
          response_headers: [
            ['Date', -10],
            ['Expires', 10],
            ['Age', '25']
          ],
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response when the `Age` header is greater than its `Expires` minus `Date`, and `Date` is fast',
      id: 'freshness-expires-age-fast-date',
      depends_on: ['freshness-expires-future'],
      requests: [
        {
          response_headers: [
            ['Date', 10],
            ['Expires', 20],
            ['Age', '15']
          ],
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    }
  ]
}
