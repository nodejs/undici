import * as templates from './lib/templates.mjs'

export default

{
  name: 'Cache-Control Freshness',
  id: 'cc-freshness',
  description: 'These tests check how caches calculate freshness using `Cache-Control`.',
  spec_anchors: ['expiration.model', 'cache-response-directive'],
  tests: [
    {
      name: 'Does HTTP cache avoid reusing a response without explict freshness information or a validator (reuse is allowed, but not common, and many tests rely upon a cache _not_ doing it)?',
      id: 'freshness-none',
      kind: 'check',
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'An optimal HTTP cache reuses a response with positive `Cache-Control: max-age`',
      id: 'freshness-max-age',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600']
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
      name: 'HTTP cache must not reuse a response with `Cache-Control: max-age` after it becomes stale',
      id: 'freshness-max-age-stale',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        templates.becomeStale({}),
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse a response with `Cache-Control: max-age=0`',
      id: 'freshness-max-age-0',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=0']
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
      name: 'An optimal HTTP cache reuses a response with `Cache-Control: max-age: 2147483647`',
      id: 'freshness-max-age-max-minus-1',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=2147483647']
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
      name: 'An optimal HTTP cache reuses a response with `Cache-Control: max-age: 2147483648`',
      id: 'freshness-max-age-max',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=2147483648']
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
      name: 'An optimal HTTP cache reuses a response with `Cache-Control: max-age: 2147483649`',
      id: 'freshness-max-age-max-plus-1',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=2147483649']
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
      name: 'An optimal HTTP cache reuses a response with `Cache-Control: max-age: 99999999999`',
      id: 'freshness-max-age-max-plus',
      kind: 'optimal',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=99999999999']
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
      name: 'HTTP cache must not reuse a response when the `Age` header is greater than its `Cache-Control: max-age` freshness lifetime',
      id: 'freshness-max-age-age',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age', 'field.age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200']
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
      name: 'Does HTTP cache consider `Date` when applying `Cache-Control: max-age` (i.e., is `apparent_age` used)?',
      id: 'freshness-max-age-date',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Date', -7200],
            ['Cache-Control', 'max-age=3600']
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
      name: 'An optimal HTTP cache reuses a response with positive `Cache-Control: max-age` and a past `Expires`',
      id: 'freshness-max-age-expires',
      depends_on: ['freshness-max-age'],
      kind: 'optimal',
      spec_anchors: ['cache-response-directive.max-age', 'field.expires'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['Expires', -7200],
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
      name: 'An optimal HTTP cache reuses a response with positive `Cache-Control: max-age` and an invalid `Expires`',
      id: 'freshness-max-age-expires-invalid',
      depends_on: ['freshness-max-age'],
      kind: 'optimal',
      spec_anchors: ['cache-response-directive.max-age', 'field.expires'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['Expires', '0', false],
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
      name: 'HTTP cache must not reuse a response with `Cache-Control: max-age=0` and a future `Expires`',
      id: 'freshness-max-age-0-expires',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age', 'field.expires'],
      requests: [
        {
          response_headers: [
            ['Expires', 3600],
            ['Cache-Control', 'max-age=0'],
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
      name: 'An optimal HTTP cache reuses a response with positive `Cache-Control: max-age` and a CC extension present',
      id: 'freshness-max-age-extension',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache.control.extensions'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'foobar, max-age=3600']
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
      name: 'An optimal HTTP cache reuses a response with positive `Cache-Control: MaX-AgE`',
      id: 'freshness-max-age-case-insenstive',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'MaX-aGe=3600']
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
      name: 'HTTP cache must not reuse a response with negative `Cache-Control: max-age`',
      id: 'freshness-max-age-negative',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=-3600']
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
      name: 'Private HTTP cache must not prefer `Cache-Control: s-maxage` over shorter `Cache-Control: max-age`',
      id: 'freshness-max-age-s-maxage-private',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 's-maxage=3600, max-age=1']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ],
      browser_only: true
    },
    {
      name: 'Private HTTP cache must not prefer `Cache-Control: s-maxage` over shorter `Cache-Control: max-age` (multiple headers)',
      id: 'freshness-max-age-s-maxage-private-multiple',
      depends_on: ['freshness-max-age'],
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 's-maxage=3600'],
            ['Cache-Control', 'max-age=1']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ],
      browser_only: true
    },
    {
      name: 'An optimal shared HTTP cache reuses a response with positive `Cache-Control: s-maxage`',
      id: 'freshness-s-maxage-shared',
      depends_on: ['freshness-none'],
      spec_anchors: ['cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 's-maxage=3600']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ],
      browser_skip: true
    },
    {
      name: 'Shared HTTP cache must prefer short `Cache-Control: s-maxage` over a longer `Cache-Control: max-age`',
      id: 'freshness-max-age-s-maxage-shared-longer',
      depends_on: ['freshness-s-maxage-shared'],
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600, s-maxage=1']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ],
      browser_skip: true
    },
    {
      name: 'Shared HTTP cache must prefer short `Cache-Control: s-maxage` over a longer `Cache-Control: max-age` (reversed)',
      id: 'freshness-max-age-s-maxage-shared-longer-reversed',
      depends_on: ['freshness-s-maxage-shared'],
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 's-maxage=1, max-age=3600']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ],
      browser_skip: true
    },
    {
      name: 'Shared HTTP cache must prefer short `Cache-Control: s-maxage` over a longer `Cache-Control: max-age` (multiple headers)',
      id: 'freshness-max-age-s-maxage-shared-longer-multiple',
      depends_on: ['freshness-s-maxage-shared'],
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['Cache-Control', 's-maxage=1']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ],
      browser_skip: true
    },
    {
      name: 'An optimal shared HTTP cache prefers long `Cache-Control: s-maxage` over a shorter `Cache-Control: max-age`',
      id: 'freshness-max-age-s-maxage-shared-shorter',
      depends_on: ['freshness-s-maxage-shared'],
      kind: 'optimal',
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1, s-maxage=3600']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ],
      browser_skip: true
    },
    {
      name: 'An optimal shared HTTP cache prefers long `Cache-Control: s-maxage` over `Cache-Control: max-age=0`, even with a past `Expires`',
      id: 'freshness-max-age-s-maxage-shared-shorter-expires',
      depends_on: ['freshness-s-maxage-shared'],
      kind: 'optimal',
      spec_anchors: ['cache-response-directive.max-age', 'cache-response-directive.s-maxage'],
      requests: [
        {
          response_headers: [
            ['Expires', -10],
            ['Cache-Control', 'max-age=0, s-maxage=3600']
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ],
      browser_skip: true
    }
  ]
}
