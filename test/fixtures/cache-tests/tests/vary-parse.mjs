import { makeTemplate } from './lib/templates.mjs'

const varyParseSetup = makeTemplate({
  request_headers: [
    ['Foo', '1'],
    ['Baz', '789']
  ],
  response_headers: [
    ['Cache-Control', 'max-age=5000'],
    ['Last-Modified', -3000],
    ['Date', 0]
  ],
  setup: true
})

export default {
  name: 'Vary Parsing',
  id: 'vary-parse',
  description: 'These tests check how caches parse the `Vary` response header.',
  spec_anchors: ['caching.negotiated.responses'],
  tests: [
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `*`',
      id: 'vary-syntax-star',
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', '*', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `*, *`',
      id: 'vary-syntax-star-star',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', '*, *', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `*, *` on different lines',
      id: 'vary-syntax-star-star-lines',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', '*', false],
            ['Vary', '*', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `, *`',
      id: 'vary-syntax-empty-star',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', ', *', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `, *` on different lines',
      id: 'vary-syntax-empty-star-lines',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', '', false],
            ['Vary', '*', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `*, Foo`',
      id: 'vary-syntax-star-foo',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', '*, Foo', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'HTTP cache must not reuse `Vary` response with a value of `Foo, *`',
      id: 'vary-syntax-foo-star',
      depends_on: ['freshness-max-age'],
      requests: [
        varyParseSetup({
          response_headers: [
            ['Vary', 'Foo, *', false]
          ]
        }),
        {
          request_headers: [
            ['Foo', '1'],
            ['Baz', '789']
          ],
          expected_type: 'not_cached'
        }
      ]
    }
  ]
}
