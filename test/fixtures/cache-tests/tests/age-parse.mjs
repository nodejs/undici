export default

{
  name: 'Age Parsing',
  id: 'age-parse',
  description: 'These tests check how caches parse the `Age` response header.',
  spec_anchors: ['field.age', 'expiration.model'],
  tests: [
    {
      name: 'HTTP cache should ignore an `Age` header with a non-numeric value',
      id: 'age-parse-nonnumeric',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', 'abc', false]
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
      name: 'HTTP cache should ignore an `Age` header with a negative value',
      id: 'age-parse-negative',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '-7200', false]
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
      name: 'HTTP cache should ignore an `Age` header with a float value',
      id: 'age-parse-float',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200.0', false]
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
      name: 'HTTP cache should consider a response with a `Age` value of 2147483647 to be stale',
      id: 'age-parse-large-minus-one',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '2147483647', false]
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
      name: 'HTTP cache should consider a response with a `Age` value of 2147483648 to be stale',
      id: 'age-parse-large',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '2147483648', false]
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
      name: 'HTTP cache should consider a response with a `Age` value of 2147483649 to be stale',
      id: 'age-parse-larger',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '2147483649', false]
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
      name: 'HTTP cache should consider a response with a single `Age` header line `old, 0` to be stale',
      id: 'age-parse-suffix',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200, 0', false]
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
      name: 'HTTP cache should consider a response with a single `Age` header line `0, old` to be fresh',
      id: 'age-parse-prefix',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '0, 7200', false]
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
      name: 'HTTP cache should use the first line in a response with multiple `Age` header lines: `old`, `0`',
      id: 'age-parse-suffix-twoline',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200', false],
            ['Age', '0', false]
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
      name: 'HTTP cache should use the first line in a response with multiple `Age` header lines: `0`, `old`',
      id: 'age-parse-prefix-twoline',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '0', false],
            ['Age', '7200', false]
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
      name: 'HTTP cache should consider a response with a single line `Age: 0, 0` to be fresh',
      id: 'age-parse-dup-0',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '0, 0', false]
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
      name: 'HTTP cache should consider a response with two `Age: 0` header lines to be fresh',
      id: 'age-parse-dup-0-twoline',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '0', false],
            ['Age', '0', false]
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
      name: 'HTTP cache should consider a response with two `Age: not_old` header lines to be fresh',
      id: 'age-parse-dup-old',
      depends_on: ['freshness-max-age-age'],
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=10000'],
            ['Age', '3600', false],
            ['Age', '3600', false]
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
      name: 'Does HTTP cache consider an alphabetic parameter on `Age` header to be valid?',
      id: 'age-parse-parameter',
      depends_on: ['freshness-max-age-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200;foo=bar', false]
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
      name: 'Does HTTP cache should consider a numeric parameter on `Age` header to be valid?',
      id: 'age-parse-numeric-parameter',
      depends_on: ['freshness-max-age-age'],
      kind: 'check',
      requests: [
        {
          response_headers: [
            ['Date', 0],
            ['Cache-Control', 'max-age=3600'],
            ['Age', '7200;foo=111', false]
          ],
          setup: true,
          pause_after: true
        },
        {
          expected_type: 'not_cached'
        }
      ]
    }
  ]
}
