export default

{
  name: 'Interim Response Handling',
  id: 'interim',
  description: 'These tests check how caches handle interim responses.',
  tests: [
    {
      name: 'An optimal HTTP cache passes a 102 response through and caches the final response',
      id: 'interim-102',
      browser_skip: true, // Fetch API in browsers don't expose interim responses
      kind: 'optimal',
      requests: [
        {
          interim_responses: [[102]],
          expected_interim_responses: [[102]],
          response_headers: [
            ['Cache-Control', 'max-age=100000'],
            ['Date', 0]
          ],
          pause_after: true
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'An optimal HTTP cache passes a 103 response through and caches the final response',
      id: 'interim-103',
      browser_skip: true,
      kind: 'optimal',
      requests: [
        {
          interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style'],
              ['x-my-header', 'test']
            ]]
          ],
          expected_interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style'],
              ['x-my-header', 'test']
            ]]
          ],
          response_headers: [
            ['Cache-Control', 'max-age=100000'],
            ['Date', 0]
          ],
          pause_after: true
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'An HTTP cache should not cache non-final responses',
      id: 'interim-not-cached',
      browser_skip: true,
      kind: 'required',
      requests: [
        {
          interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style']
            ]]
          ],
          expected_interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style']
            ]]
          ],
          response_headers: [
            ['Cache-Control', 'max-age=100000'],
            ['Date', 0]
          ],
          pause_after: true
        },
        {
          expected_type: 'cached',
          expected_interim_responses: []
        }
      ]
    },
    {
      name: 'An optimal HTTP cache should not store headers from non-final responses',
      id: 'interim-no-header-reuse',
      browser_skip: true,
      kind: 'optimal',
      requests: [
        {
          interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style'],
              ['x-my-header', 'test']
            ]]
          ],
          expected_interim_responses: [
            [103, [
              ['link', '</styles.css>; rel=preload; as=style'],
              ['x-my-header', 'test']
            ]]
          ],
          response_headers: [
            ['Cache-Control', 'max-age=100000'],
            ['Date', 0]
          ],
          expected_response_headers_missing: [
            'x-my-header'
          ],
          pause_after: true
        },
        {
          expected_type: 'cached',
          expected_response_headers_missing: [
            'x-my-header'
          ]
        }
      ]
    }
  ]
}
