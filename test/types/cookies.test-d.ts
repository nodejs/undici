import { expectError, expectType } from 'tsd'
import { Headers, deleteCookie } from '../..'

const headers = new Headers()

expectType<void>(deleteCookie(headers, 'session'))
expectType<void>(deleteCookie(headers, 'session', { domain: 'example.com' }))
expectType<void>(deleteCookie(headers, 'session', { path: '/' }))
expectType<void>(deleteCookie(headers, 'session', { domain: 'example.com', path: '/' }))

expectError(deleteCookie(headers, 'session', { name: 'session' }))
