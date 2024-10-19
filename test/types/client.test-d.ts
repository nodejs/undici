import { expectAssignable } from 'tsd'
import { Client, Dispatcher } from '../..'
import { URL } from 'url'

expectAssignable<Client>(new Client(''))
expectAssignable<Client>(new Client('', {}))
expectAssignable<Client>(new Client('', {
  maxRequestsPerClient: 10
}))
expectAssignable<Client>(new Client('', {
  connect: { rejectUnauthorized: false }
}))
expectAssignable<Client>(new Client(new URL('http://localhost'), {}))

/**
 * Tests for Client.Options:
 */
expectAssignable<Client>(new Client('', {
  maxHeaderSize: 16384
}))
expectAssignable<Client>(new Client('', {
  headersTimeout: 300e3
}))
expectAssignable<Client>(new Client('', {
  connectTimeout: 300e3
}))
expectAssignable<Client>(new Client('', {
  bodyTimeout: 300e3
}))
expectAssignable<Client>(new Client('', {
  keepAliveTimeout: 4e3
}))
expectAssignable<Client>(new Client('', {
  keepAliveMaxTimeout: 600e3
}))
expectAssignable<Client>(new Client('', {
  keepAliveTimeoutThreshold: 1e3
}))
expectAssignable<Client>(new Client('', {
  socketPath: '/var/run/docker.sock'
}))
expectAssignable<Client>(new Client('', {
  pipelining: 1
}))
expectAssignable<Client>(new Client('', {
  strictContentLength: true
}))
expectAssignable<Client>(new Client('', {
  maxCachedSessions: 1
}))
expectAssignable<Client>(new Client('', {
  maxRedirections: 1
}))
expectAssignable<Client>(new Client('', {
  maxRequestsPerClient: 1
}))
expectAssignable<Client>(new Client('', {
  localAddress: '127.0.0.1'
}))
expectAssignable<Client>(new Client('', {
  maxResponseSize: -1
}))
expectAssignable<Client>(new Client('', {
  autoSelectFamily: true
}))
expectAssignable<Client>(new Client('', {
  autoSelectFamilyAttemptTimeout: 300e3
}))
expectAssignable<Client>(new Client('', {
  interceptors: {
    Client: [(dispatcher) => {
      expectAssignable<Dispatcher['dispatch']>(dispatcher)
      return (opts, handlers) => {
        expectAssignable<Dispatcher.DispatchOptions>(opts)
        expectAssignable<Dispatcher.DispatchHandlers>(handlers)
        return dispatcher(opts, handlers)
      }
    }]
  }
}))

{
  const client = new Client('')

  // properties
  expectAssignable<number>(client.pipelining)
  expectAssignable<boolean>(client.closed)
  expectAssignable<boolean>(client.destroyed)

  // request
  expectAssignable<Promise<Dispatcher.ResponseData>>(client.request({ origin: '', path: '', method: 'GET' }))
  expectAssignable<Promise<Dispatcher.ResponseData>>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: 'GET' }))
  expectAssignable<void>(client.request({ origin: '', path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))
  expectAssignable<void>(client.request({ origin: new URL('http://localhost:3000'), path: '', method: 'GET' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Dispatcher.ResponseData>(data)
  }))

  // dispatch
  expectAssignable<boolean>(client.dispatch({ origin: '', path: '', method: 'GET' }, {}))
  expectAssignable<boolean>(client.dispatch({ origin: '', path: '', method: 'GET', headers: [] }, {}))
  expectAssignable<boolean>(client.dispatch({ origin: '', path: '', method: 'GET', headers: {} }, {}))
  expectAssignable<boolean>(client.dispatch({ origin: '', path: '', method: 'GET', headers: null }, {}))
  expectAssignable<boolean>(client.dispatch({ origin: new URL('http://localhost'), path: '', method: 'GET' }, {}))

  // close
  expectAssignable<Promise<void>>(client.close())
  expectAssignable<void>(client.close(() => {}))

  // destroy
  expectAssignable<Promise<void>>(client.destroy())
  expectAssignable<Promise<void>>(client.destroy(new Error()))
  expectAssignable<Promise<void>>(client.destroy(null))
  expectAssignable<void>(client.destroy(() => {}))
  expectAssignable<void>(client.destroy(new Error(), () => {}))
  expectAssignable<void>(client.destroy(null, () => {}))
}
