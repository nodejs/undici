import { expectError, expectType } from 'tsd'
import { Headers, deleteCookie } from '../..'

const headers = new Headers()

// `path` and `domain` should be accepted as deleteCookie attributes.
expectType<void>(deleteCookie(headers, 'session', {
  domain: 'example.com',
  path: '/'
}))

expectType<void>(deleteCookie(headers, 'session', { path: '/' }))
expectType<void>(deleteCookie(headers, 'session', { domain: 'example.com' }))

// `name` should not be accepted because the cookie name is the second positional argument.
expectError(deleteCookie(headers, 'session', {
  domain: 'example.com',
  name: 'session'
}))
