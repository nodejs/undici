
# Contributing

Contributions from cache vendors and users are welcome.

Over time we'll document guidelines and best practices for contribution, but in the meantime, feel free to file issues and create PRs.


## Test Format

Each test run gets its own URL, randomized content, and operates independently.

Tests are kept in JavaScript files in `tests/`, each file representing a suite.

A suite is an object with the following members:

- `name` - A concise description of the suite. Required.
- `id` - A short, stable identifier for the suite. Required.
- `description` - A longer description of the suite, can contain Markdown. Optional.
- `spec_anchors` - An array of strings that represent anchors in the HTTP Caching specification related to this suite. Optional.
- `tests` - see below.

E.g.,

```javascript
export default {
  name: 'Example Tests',
  id: 'example',
  description: 'These are the `Foo` tests!'
  tests: [ ... ]
}
```

The `tests` member is an array of objects, with the following members:

- `name` - A concise description of the test. Can contain Markdown. Required.
- `id` - A short, stable identifier for the test. Required.
- `description` - Longer details of the test. Optional.
- `kind` - One of:
  - `required` - This is a conformance test for a requirement in the standard. Default.
  - `optimal` - This test is to see if the cache behaves optimally.
  - `check` - This test is gathering information about cache behaviour.
- `requests` - a list of request objects (see below).
- `browser_only` - if `true`, will only run on browser caches. Default `false`.
- `cdn_only` - if `true`, will only run on CDN caches. Default `false`.
- `browser_skip` - if `true, will not run on browser caches. Default `false`.
- `depends_on` - a list of test IDs that, when one fails, indicates that this test's results are not useful. Currently limited to test IDs in the same suite. Optional.
- `spec_anchors` - An array of strings that represent anchors in the HTTP Caching specification related to this test. Optional.

Possible members of a request object:

- `request_method` - A string containing the HTTP method to be used. Default `GET`.
- `request_headers` - An array of `[header_name_string, header_value_string]` arrays to
                    emit in the request.
- `request_body` - A string to use as the request body.
- `query_arg` - query arguments to add.
- `filename` - filename to use.
- `mode` - The mode string to pass to `fetch()`.
- `credentials` - The credentials string to pass to `fetch()`.
- `cache` - The cache string to pass to `fetch()`.
- `redirect` - The redirect string to pass to `fetch()`.
- `pause_after` - Boolean controlling a 3-second pause after the request completes.
- `disconnect` - Close the connection when receiving this request.
- `magic_locations` - Boolean; if `true`, the `Location` and `Content-Location` response headers will be rewritten to full URLs.
- `magic_ims` - Boolean; if `true`, the `If-Modified-Since` request header will be written as a delta against the previous response's `Last-Modified`, instead of `now`.
- `rfc850date` - Array of header names to use RFC850 format on when magically converting dates.
- `response_status` - A `[number, string]` array containing the HTTP status code
                    and phrase to return from the origin. Default `200` or `304`.
- `response_headers` - An array of `[header_name_string, header_value_string]` arrays to
                     emit in the origin response. These values will also be checked like
                     expected_response_headers, unless there is a third value that is
                     `false`.
- `response_body` - String to send as the response body from the origin. Defaults to
                  the test identifier.
- `response_pause` - Integer number of seconds for the server to pause before generating a response.
- `check_body` - Whether to check the response body. Default `true`.
- `expected_type` - One of:
  - `cached`: The response is served from cache
  - `not_cached`: The response is not served from cache; it comes from the origin
  - `lm_validated`: The response comes from cache, but was validated on the origin with Last-Modified
  - `etag_validated`: The response comes from cache, but was validated on the origin with an ETag
- `expected_method` - A string HTTP method; checked on the server.
- `expected_status` - A numeric HTTP status code; checked on the client.
                    If not set, the value of `response_status[0]` will be used; if that
                    is not set, 200 will be used.
- `expected_request_headers` - An array of `[header_name_string, header_value_string]` representing
                              headers to check the request for on the server, or an array of
                              strings representing header names to check for presence in the
                              request.
- `expected_request_headers_missing` - An array of `[header_name_string, header_value_string]`
                                       representing headers to check for absence in the request for on the server, or an array of strings representing header names to check for absence in the request.
- `expected_response_headers` - An array of any combination of the following. See also `response_headers`.
  - `header_name_string`: assert that the named header is present
  - `[header_name_string, header_value_string]`: assert that the header has the given value
  - `[header_name_string, '=', other_header_name]`: assert that the two headers have the same value
  - `[header_name_string, '>', number]`: assert that the header's value is numerically greater than specified
- `expected_response_headers_missing` - An array of any combination of the following.
  - `header_name_string` representing headers to check that the response on the client does not include.
  - `[header_name_string, header_value_string]`: headers to check that the response is either missing, or if they're present, that they do _not_ contain the given value string (evaluated against the whole header value).
- `expected_response_text` - A string to check the response body against on the client.
- `setup` - Boolean to indicate whether this is a setup request; failures don't mean the actual test failed.
- `setup_tests` - Array of values that indicate whether the specified check is part of setup; failures don't mean the actual test failed. One of: `["expected_type", "expected_method", "expected_status", "expected_response_headers", "expected_response_text", "expected_request_headers"]`

`server.js` stashes an entry containing observed headers for each request it receives. When the
test fetches have run, this state is retrieved and the expected_* lists are checked, including
their length.

For convenience and clarity when writing tests, there are some request templates available in `templates.mjs`. Each template is a function which accepts a request object, as defined above, and returns a new request object. Any fields in the template are added to the request object unless a field of the same name is already present.
