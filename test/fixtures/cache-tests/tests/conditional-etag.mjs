import * as templates from './lib/templates.mjs'

export default {
  name: 'Conditional Requests: If-None-Match and ETag',
  id: 'conditional-inm',
  description: 'These tests check handling of conditional requests using `If-None-Match` and `ETag`.',
  spec_anchors: ['validation.model'],
  tests: [
    {
      name: 'An optimal HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching strong `ETag`',
      id: 'conditional-etag-strong-respond',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache must include `ETag` in a `304 Not Modified`',
      id: 'conditional-304-etag',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304,
          expected_response_headers: [
            ['ETag', '"abcdef"']
          ]
        }
      ]
    },
    {
      name: 'HTTP cache must give precedence to `If-None-Match` over `If-Modified-Since`',
      id: 'conditional-etag-precedence',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['Last-Modified', -5000],
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdef"'],
            ['If-Modified-Since', -1]
          ],
          magic_ims: true,
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'Does HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching strong `ETag` containing obs-text?',
      id: 'conditional-etag-strong-respond-obs-text',
      kind: 'check',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdefü"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdefü"']
          ],
          expected_type: 'cached',
          expected_status: 304,
          expected_response_headers: [
            ['ETag', '"abcdefü"']
          ]
        }
      ]
    },
    {
      name: 'HTTP cache responds to unquoted `If-None-Match` with a `304` when holding a fresh response with a matching strong `ETag` that is quoted',
      id: 'conditional-etag-quoted-respond-unquoted',
      kind: 'check',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'abcdef']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache responds to unquoted `If-None-Match` with a `304` when holding a fresh response with a matching strong `ETag` that is unquoted',
      id: 'conditional-etag-unquoted-respond-unquoted',
      kind: 'check',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'abcdef']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'abcdef']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache responds to quoted `If-None-Match` with a `304` when holding a fresh response with a matching strong `ETag` that is unquoted',
      id: 'conditional-etag-unquoted-respond-quoted',
      kind: 'check',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'abcdef']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching weak `ETag`',
      id: 'conditional-etag-weak-respond',
      kind: 'optimal',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'W/"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'W/"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching weak `ETag`, and the entity-tag weakness flag is lowercase',
      id: 'conditional-etag-weak-respond-lowercase',
      kind: 'check',
      depends_on: ['conditional-etag-weak-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'w/"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'w/"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching weak `ETag`, and the entity-tag weakness flag uses `\\` instead of `/`',
      id: 'conditional-etag-weak-respond-backslash',
      kind: 'check',
      depends_on: ['conditional-etag-weak-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'W\\"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'W\\"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache responds to `If-None-Match` with a `304` when holding a fresh response with a matching weak `ETag`, and the entity-tag weakness flag omits `/`',
      id: 'conditional-etag-weak-respond-omit-slash',
      depends_on: ['conditional-etag-weak-respond'],
      kind: 'check',
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', 'W"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', 'W"abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-None-Match` with a `304` when it contains multiple entity-tags (first one)',
      id: 'conditional-etag-strong-respond-multiple-first',
      kind: 'optimal',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"abcdef", "1234", "5678"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-None-Match` with a `304` when it contains multiple entity-tags (middle one)',
      id: 'conditional-etag-strong-respond-multiple-second',
      kind: 'optimal',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"1234", "abcdef", "5678"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'An optimal HTTP cache responds to `If-None-Match` with a `304` when it contains multiple entity-tags (last one)',
      id: 'conditional-etag-strong-respond-multiple-last',
      kind: 'optimal',
      depends_on: ['conditional-etag-strong-respond'],
      browser_skip: true,
      requests: [
        templates.fresh({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          request_headers: [
            ['If-None-Match', '"1234", "5678", "abcdef"']
          ],
          expected_type: 'cached',
          expected_status: 304
        }
      ]
    },
    {
      name: 'HTTP cache must include stored response headers identified by `Vary` in a conditional request it generates',
      id: 'conditional-etag-vary-headers',
      requests: [
        {
          request_headers: [
            ['Abc', '123']
          ],
          response_headers: [
            ['Expires', 1],
            ['ETag', '"abcdef"'],
            ['Date', 0],
            ['Vary', 'Abc']
          ],
          setup: true,
          pause_after: true
        },
        {
          request_headers: [
            ['Abc', '123']
          ],
          expected_type: 'etag_validated',
          expected_request_headers: [
            ['Abc', '123']
          ],
          setup_tests: ['expected_type']
        }
      ]
    },
    {
      name: 'HTTP cache must not use a stored `ETag` to validate when the presented `Vary`ing request header differs',
      id: 'conditional-etag-vary-headers-mismatch',
      depends_on: ['conditional-etag-vary-headers', 'vary-no-match'],
      requests: [
        {
          request_headers: [
            ['Abc', '123']
          ],
          response_headers: [
            ['Expires', 10000],
            ['ETag', '"abcdef"'],
            ['Date', 0],
            ['Vary', 'Abc']
          ],
          setup: true,
          pause_after: true
        },
        {
          request_headers: [
            ['Abc', '456']
          ],
          expected_request_headers_missing: [
            ['If-None-Match', '"abcdef"']
          ]
        }
      ]
    },
    {
      name: 'An optimal HTTP cache generates a `If-None-Match` request when holding a stale response with a matching strong `ETag`',
      id: 'conditional-etag-strong-generate',
      kind: 'optimal',
      depends_on: ['freshness-max-age-stale'],
      requests: [
        templates.becomeStale({
          response_headers: [
            ['ETag', '"abcdef"']
          ]
        }),
        {
          expected_request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_type: 'etag_validated'
        }
      ]
    },
    {
      name: 'An optimal HTTP cache generates a `If-None-Match` request when holding a stale response with a matching weak `ETag`',
      id: 'conditional-etag-weak-generate-weak',
      kind: 'optimal',
      depends_on: ['freshness-max-age-stale'],
      requests: [
        templates.becomeStale({
          response_headers: [
            ['ETag', 'W/"abcdef"']
          ]
        }),
        {
          expected_request_headers: [
            ['If-None-Match', 'W/"abcdef"']
          ],
          expected_type: 'etag_validated'
        }
      ]
    },
    {
      name: 'Does HTTP cache generate a quoted `If-None-Match` request when holding a stale response with a matching, unquoted strong `ETag`?',
      id: 'conditional-etag-strong-generate-unquoted',
      kind: 'check',
      depends_on: ['conditional-etag-strong-generate'],
      requests: [
        templates.becomeStale({
          response_headers: [
            ['ETag', 'abcdef']
          ]
        }),
        {
          expected_request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_type: 'etag_validated'
        }
      ]
    },
    {
      name: 'Does HTTP cache forward `If-None-Match` request header when no stored response is available?',
      id: 'conditional-etag-forward',
      kind: 'check',
      requests: [
        {
          request_headers: [
            ['If-None-Match', '"abcdef"']
          ],
          expected_request_headers: [
            ['If-None-Match', '"abcdef"']
          ]
        }
      ]
    },
    {
      name: 'Does HTTP cache add quotes to an unquoted `If-None-Match` request when forwarding it?',
      id: 'conditional-etag-forward-unquoted',
      depends_on: ['conditional-etag-forward'],
      kind: 'check',
      requests: [
        {
          request_headers: [
            ['If-None-Match', 'abcdef']
          ],
          expected_request_headers: [
            ['If-None-Match', '"abcdef"']
          ]
        }
      ]
    }
  ]
}
