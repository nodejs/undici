export default

{
  name: 'CDN-Cache-Control',
  id: 'cdn-cache-control',
  description: 'These tests check non-browser caches for behaviours around the [`CDN-Cache-Control` response header](https://httpwg.org/specs/rfc9213.html).',
  tests: [
    {
      name: 'An optimal CDN reuses a response with positive `CDN-Cache-Control: max-age`',
      id: 'cdn-max-age',
      cdn_only: true,
      depends_on: ['freshness-none'],
      kind: 'optimal',
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=3600', false]
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
      name: 'An optimal CDN reuses a response with `CDN-Cache-Control: max-age: 2147483648`',
      id: 'cdn-max-age-max',
      kind: 'optimal',
      cdn_only: true,
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=2147483648', false]
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
      name: 'An optimal CDN reuses a response with `CDN-Cache-Control: max-age: 99999999999`',
      id: 'cdn-max-age-max-plus',
      kind: 'optimal',
      cdn_only: true,
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=99999999999', false]
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
      name: 'CDN must not reuse a response when the `Age` header is greater than its `CDN-Cache-Control: max-age` freshness lifetime',
      id: 'cdn-max-age-age',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['CDN-Cache-Control', 'max-age=3600', false],
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
      name: 'Does CDN ignore `CDN-Cache-Control: max-age` with space before the `=`?',
      id: 'cdn-max-age-space-before-equals',
      cdn_only: true,
      kind: 'check',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['CDN-Cache-Control', 'max-age =100', false]
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
      name: 'Does CDN ignore `CDN-Cache-Control: max-age` with space after the `=`?',
      id: 'cdn-max-age-space-after-equals',
      cdn_only: true,
      kind: 'check',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['CDN-Cache-Control', 'max-age= 100', false]
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
      name: 'CDN must not reuse a response with `CDN-Cache-Control: max-age=0`',
      id: 'cdn-max-age-0',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=0', false]
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
      name: 'An optimal CDN reuses a response with a positive `CDN-Cache-Control: max-age` and an extension cache directive',
      id: 'cdn-max-age-extension',
      cdn_only: true,
      kind: 'optimal',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'foobar, max-age=3600', false]
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
      name: 'Does CDN reuse a response with a positive `CDN-Cache-Control: MaX-aGe`?',
      id: 'cdn-max-age-case-insensitive',
      cdn_only: true,
      kind: 'check',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'MaX-aGe=3600', false]
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
      name: 'An optimal CDN reuses a response with a positive `CDN-Cache-Control: max-age` and a past `Expires`',
      id: 'cdn-max-age-expires',
      cdn_only: true,
      kind: 'optimal',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=3600', false],
            ['Expires', -10000],
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
      name: 'An optimal CDN reuses a response with a positive `CDN-Cache-Control: max-age` and an invalid `Expires`',
      id: 'cdn-max-age-cc-max-age-invalid-expires',
      cdn_only: true,
      kind: 'optimal',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=3600', false],
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
      name: 'CDN must not reuse a response with a `CDN-Cache-Control: max-age=0` and a future `Expires`',
      id: 'cdn-max-age-0-expires',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=0', false],
            ['Expires', 10000],
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
      name: 'An optimal CDN prefers a long `CDN-Cache-Control: max-age` over a short `Cache-Control: max-age`',
      id: 'cdn-max-age-short-cc-max-age',
      cdn_only: true,
      kind: 'optimal',
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['CDN-Cache-Control', 'max-age=3600', false]
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'CDN must prefer a short `CDN-Cache-Control: max-age` over a long `Cache-Control: max-age`',
      id: 'cdn-max-age-long-cc-max-age',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['CDN-Cache-Control', 'max-age=1', false]
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'CDN must not reuse a cached response with `CDN-Cache-Control: private`, even with `Cache-Control: max-age` and `Expires`',
      id: 'cdn-private',
      cdn_only: true,
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'private'],
            ['Cache-Control', 'max-age=10000'],
            ['Expires', 10000],
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
      name: 'CDN must not reuse a cached response with `CDN-Cache-Control: no-cache`, even with `Cache-Control: max-age` and `Expires`',
      id: 'cdn-no-cache',
      cdn_only: true,
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'no-cache'],
            ['Cache-Control', 'max-age=10000'],
            ['Expires', 10000],
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
      name: 'CDN must not store a response with `CDN-Cache-Control: no-store`, even with `Cache-Control: max-age` and `Expires`',
      id: 'cdn-no-store-cc-fresh',
      cdn_only: true,
      depends_on: ['freshness-none'],
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=10000'],
            ['CDN-Cache-Control', 'no-store', false],
            ['Expires', 10000],
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
      name: 'An optimal CDN stores a response with a fresh `CDN-Cache-Control: max-age`, even with `Cache-Control: no-store`',
      id: 'cdn-fresh-cc-nostore',
      depends_on: ['freshness-none'],
      cdn_only: true,
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'no-store'],
            ['CDN-Cache-Control', 'max-age=10000', false]
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
      name: 'CDN should ignore a `CDN-Cache-Control` that\'s an invalid Structured Field (unknown type)',
      id: 'cdn-cc-invalid-sh-type-unknown',
      depends_on: ['cdn-max-age'],
      cdn_only: true,
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age=10000, &&&&&', false],
            ['Cache-Control', 'no-store']
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
      name: 'CDN should ignore a `CDN-Cache-Control` that\'s an invalid Structured Field (wrong type)',
      id: 'cdn-cc-invalid-sh-type-wrong',
      depends_on: ['cdn-max-age'],
      cdn_only: true,
      requests: [
        {
          response_headers: [
            ['CDN-Cache-Control', 'max-age="10000"', false],
            ['Cache-Control', 'no-store']
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
      name: 'Does the CDN forward the `CDN-Cache-Control` response header?',
      id: 'cdn-remove-header',
      cdn_only: true,
      kind: 'check',
      requests: [
        {
          // only check for the header in expected_response_headers, so failing
          // this is an assertion failure and not a setup error
          response_headers: [
            ['Cache-Control', 'max-age=10000'],
            ['CDN-Cache-Control', 'foo', false],
            ['Expires', 10000],
            ['Date', 0]
          ],
          expected_response_headers: [
            ['CDN-Cache-Control', 'foo']
          ]
        }
      ]
    },
    {
      name: 'Does the CDN send `Age` when `CDN-Cache-Control: max-age` exceeds `Cache-Control: max-age`?',
      id: 'cdn-remove-age-exceed',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['CDN-Cache-Control', 'max-age=10000'],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_response_headers: [
            'Age'
          ]
        }
      ]
    },
    {
      name: 'Does the CDN preserve `Date` when `CDN-Cache-Control: max-age` exceeds `Cache-Control: max-age`?',
      id: 'cdn-date-update-exceed',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['CDN-Cache-Control', 'max-age=10000'],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_response_headers: [
            ['Date', 0]
          ]
        }
      ]
    },
    {
      name: 'Does the CDN preserve `Expires` when `CDN-Cache-Control: max-age` exceeds `Cache-Control: max-age`?',
      id: 'cdn-expires-update-exceed',
      cdn_only: true,
      depends_on: ['cdn-max-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Cache-Control', 'max-age=1'],
            ['Expires', 1],
            ['CDN-Cache-Control', 'max-age=10000'],
            ['Date', 0]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_response_headers: [
            ['Expires', 1]
          ]
        }
      ]
    }
  ]
}
