export default

{
  name: 'Method-related Caching Requirements',
  id: 'method',
  description: 'These tests check how caches handle different HTTP methods.',
  spec_anchors: ['response.cacheability'],
  tests: [
    {
      name: 'An optimal HTTP cache reuses a stored `POST` response (that has `Content-Location` with the same URL and explicit freshness) for subsequent `GET` requests',
      id: 'method-POST',
      kind: 'optimal',
      requests: [
        {
          request_method: 'POST',
          request_body: '12345',
          request_headers: [
            ['Content-Type', 'text/plain']
          ],
          response_headers: [
            ['Cache-Control', 'max-age=3600'],
            ['Content-Location', ''],
            ['Date', 0]
          ],
          magic_locations: true,
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
