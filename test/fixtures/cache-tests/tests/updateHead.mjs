import * as templates from './lib/templates.mjs'

export default

{
  name: 'HEAD updates',
  id: 'updateHEAD',
  description: 'These tests check how a cache updates stored responses when receiving a `HEAD` response.',
  spec_anchors: ['head.effects'],
  tests: [
    {
      name: 'Does HTTP cache write through a HEAD when stored response is stale?',
      id: 'head-writethrough',
      kind: 'check',
      depends_on: ['freshness-max-age-stale'],
      requests: [
        templates.becomeStale({}),
        {
          request_method: 'HEAD',
          expected_method: 'HEAD'
        }
      ]
    },
    {
      name: 'Does HTTP cache preserve stored fields not received in a `200` response to a `HEAD`?',
      id: 'head-200-retain',
      kind: 'check',
      depends_on: ['head-writethrough'],
      requests: [
        templates.becomeStale({}),
        {
          request_method: 'HEAD',
          expected_method: 'HEAD',
          expected_response_headers: [
            ['Template-A', '1']
          ]
        }
      ]
    },
    {
      name: 'Does HTTP cache update freshness lifetime recieved in a `200` response to a `HEAD`?',
      id: 'head-200-freshness-update',
      kind: 'check',
      depends_on: ['head-writethrough'],
      requests: [
        templates.becomeStale({}),
        {
          request_method: 'HEAD',
          expected_method: 'HEAD',
          response_headers: [
            ['Cache-Control', 'max-age=1000']
          ]
        },
        {
          expected_type: 'cached'
        }
      ]
    },
    {
      name: 'Does HTTP cache update stored fields recieved in a `200` response to a `HEAD`?',
      id: 'head-200-update',
      kind: 'check',
      depends_on: ['head-200-freshness-update'],
      requests: [
        templates.becomeStale({}),
        {
          request_method: 'HEAD',
          expected_method: 'HEAD',
          response_headers: [
            ['Template-A', '2'],
            ['Cache-Control', 'max-age=1000']
          ]
        },
        {
          expected_type: 'cached',
          setup_tests: ['expected_type'],
          expected_response_headers: [
            ['Template-A', '2']
          ]
        }
      ]
    },
    {
      name: 'Does HTTP cache update stored fields recieved in a `410` response to a `HEAD`?',
      id: 'head-410-update',
      kind: 'check',
      depends_on: ['head-200-freshness-update'],
      requests: [
        templates.becomeStale({}),
        {
          request_method: 'HEAD',
          expected_method: 'HEAD',
          response_status: [410, 'Gone'],
          response_headers: [
            ['Template-A', '2'],
            ['Cache-Control', 'max-age=1000']
          ]
        },
        {
          expected_type: 'cached',
          setup_tests: ['expected_type'],
          expected_response_headers: [
            ['Template-A', '2']
          ]
        }
      ]
    }
  ]
}
