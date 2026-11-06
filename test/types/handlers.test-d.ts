import { expectAssignable } from 'tsd'
import { Agent, Dispatcher, RedirectHandler } from '../..'

const dispatcher = new Agent()

expectAssignable<Dispatcher.Dispatch>(RedirectHandler.buildDispatch(dispatcher, 3))

expectAssignable<Dispatcher.DispatchHandler>(new RedirectHandler(dispatcher.dispatch.bind(dispatcher), 3, {
  origin: 'http://example.test',
  path: '/',
  method: 'GET'
}, {}, 'http://example.test'))
