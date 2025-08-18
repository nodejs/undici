import * as templates from './lib/templates.mjs'

export default

{
  name: 'Storing Respones to Authenticated Requests',
  id: 'auth',
  description: 'These tests check for behaviours regarding authenticated HTTP responses.',
  spec_anchors: ['caching.authenticated.responses'],
  tests: [
    {
      name: 'HTTP shared cache must not reuse a response to a request that contained `Authorization`, even with explicit freshness',
      id: 'other-authorization',
      depends_on: ['freshness-max-age'],
      browser_skip: true,
      requests: [
        templates.fresh({
          request_headers: [
            ['Authorization', 'FOO']
          ],
          expected_request_headers: [
            ['Authorization', 'FOO']
          ]
        }),
        {
          expected_type: 'not_cached'
        }
      ]
    },
    {
      name: 'An optimal HTTP shared cache reuses a response to a request that contained `Authorization`, if it has `Cache-Control: public`',
      id: 'other-authorization-public',
      kind: 'optimal',
      browser_skip: true,
      depends_on: ['other-authorization'],
      spec_anchors: ['cache-response-directive.public'],
      requests: [
        {
          request_headers: [
            ['Authorization', 'FOO']
          ],
          expected_request_headers: [
            ['Authorization', 'FOO']
          ],
          response_headers: [
            ['Cache-Control', 'max-age=3600, public'],
            ['Date', 0]
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
      name: 'An optimal HTTP shared cache reuses a response to a request that contained `Authorization`, if it has `Cache-Control: must-revalidate`',
      id: 'other-authorization-must-revalidate',
      kind: 'optimal',
      browser_skip: true,
      depends_on: ['other-authorization'],
      requests: [
        {
          request_headers: [
            ['Authorization', 'FOO']
          ],
          expected_request_headers: [
            ['Authorization', 'FOO']
          ],
          response_headers: [
            ['Cache-Control', 'max-age=3600, must-revalidate'],
            ['Date', 0]
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
      name: 'An optimal HTTP shared cache reuses a response to a request that contained `Authorization`, if it has `Cache-Control: s-maxage`',
      id: 'other-authorization-smaxage',
      kind: 'optimal',
      browser_skip: true,
      depends_on: ['other-authorization'],
      requests: [
        {
          request_headers: [
            ['Authorization', 'FOO']
          ],
          expected_request_headers: [
            ['Authorization', 'FOO']
          ],
          response_headers: [
            ['Cache-Control', 's-maxage=3600'],
            ['Date', 0]
          ],
          pause_after: true,
          setup: true
        },
        {
          expected_type: 'cached'
        }
      ]
    }
  ]
}
