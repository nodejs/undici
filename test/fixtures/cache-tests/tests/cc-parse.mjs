export default

{
  name: 'Cache-Control Parsing',
  id: 'cc-parse',
  description: 'These tests check how caches parse the `Cache-Control` response header.',
  spec_anchors: ['field.cache-control'],
  tests: [
    {
      name: 'Does HTTP cache reuse a response when first `Cache-Control: max-age` is fresh, but second is stale (same line)?',
      id: 'freshness-max-age-two-fresh-stale-sameline',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1800, max-age=1', false]
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
      name: 'Does HTTP cache reuse a response when first `Cache-Control: max-age` is fresh, but second is stale (separate lines)?',
      id: 'freshness-max-age-two-fresh-stale-sepline',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1800', false],
            ['Cache-Control', 'max-age=1', false]
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
      name: 'Does HTTP cache reuse a response when first `Cache-Control: max-age` is stale, but second is fresh (same line)?',
      id: 'freshness-max-age-two-stale-fresh-sameline',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1, max-age=1800', false]
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
      name: 'Does HTTP cache reuse a response when first `Cache-Control: max-age` is stale, but second is fresh (separate lines)?',
      id: 'freshness-max-age-two-stale-fresh-sepline',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1', false],
            ['Cache-Control', 'max-age=1800', false]
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
      name: 'Does HTTP cache reuse a response with a quoted `Cache-Control: max-age`?',
      id: 'freshness-max-age-quoted',
      kind: 'check',
      depends_on: ['freshness-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age="3600"', false]
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
      name: 'HTTP cache must not reuse a response with `max-age` in a quoted string (before the "real" `max-age`)',
      id: 'freshness-max-age-ignore-quoted',
      depends_on: ['freshness-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'extension="max-age=3600", max-age=1', false]
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
      name: 'HTTP cache mut not reuse a response with `max-age` in a quoted string (after the "real" `max-age`)',
      id: 'freshness-max-age-ignore-quoted-rev',
      depends_on: ['freshness-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1, extension="max-age=3600"', false]
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
      name: 'Does HTTP cache ignore max-age with space before the `=`?',
      id: 'freshness-max-age-space-before-equals',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age =3600', false]
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
      name: 'Does HTTP cache ignore max-age with space after the `=`?',
      id: 'freshness-max-age-space-after-equals',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age= 3600', false]
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
      name: 'An optimal HTTP cache reuses max-age with the value `003600`',
      id: 'freshness-max-age-leading-zero',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=003600', false]
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
      name: 'HTTP cache must not reuse a response with a single-quoted `Cache-Control: max-age`',
      id: 'freshness-max-age-single-quoted',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=\'3600\'', false]
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
      name: 'Does HTTP cache reuse max-age with `3600.0` value?',
      id: 'freshness-max-age-decimal-zero',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600.0', false]
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
      name: 'Does HTTP cache reuse max-age with `3600.5` value?',
      id: 'freshness-max-age-decimal-five',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600.5', false]
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
      name: 'Does HTTP cache reuse a response with an invalid `Cache-Control: max-age` (leading alpha)?',
      id: 'freshness-max-age-a100',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=a3600', false]
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
      name: 'Does HTTP cache reuse a response with an invalid `Cache-Control: max-age` (trailing alpha)?',
      id: 'freshness-max-age-100a',
      kind: 'check',
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600a', false]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'cached'
        }
      ]
    }
  ]
}
