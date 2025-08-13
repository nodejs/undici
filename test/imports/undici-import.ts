import { expectType } from 'tsd'
import { Dispatcher, interceptors, request } from '../../'

async function exampleCode () {
  const retry = interceptors.retry()
  const rd = interceptors.redirect()
  const dump = interceptors.dump()

  expectType<Dispatcher.DispatcherComposeInterceptor>(retry)
  expectType<Dispatcher.DispatcherComposeInterceptor>(rd)
  expectType<Dispatcher.DispatcherComposeInterceptor>(dump)

  await request('http://localhost:3000/foo')
}

exampleCode()
