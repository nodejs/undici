import { Dispatcher } from '../..'
import { expectAssignable } from 'tsd'
import { URL } from 'url'
import Errors from '../../types/errors'

interface EventHandler {
  connect(origin: URL, targets: readonly Dispatcher[]): void
  disconnect(origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError): void
  connectionError(origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError): void
  drain(origin: URL): void
}

{
  const dispatcher = new Dispatcher()
  const eventHandler: EventHandler = {} as EventHandler

  expectAssignable<EventHandler['connect'][]>(dispatcher.rawListeners('connect'))
  expectAssignable<EventHandler['disconnect'][]>(dispatcher.rawListeners('disconnect'))
  expectAssignable<EventHandler['connectionError'][]>(dispatcher.rawListeners('connectionError'))
  expectAssignable<EventHandler['drain'][]>(dispatcher.rawListeners('drain'))

  expectAssignable<EventHandler['connect'][]>(dispatcher.listeners('connect'))
  expectAssignable<EventHandler['disconnect'][]>(dispatcher.listeners('disconnect'))
  expectAssignable<EventHandler['connectionError'][]>(dispatcher.listeners('connectionError'))
  expectAssignable<EventHandler['drain'][]>(dispatcher.listeners('drain'))

  const eventHandlerMethods: ['on', 'once', 'off', 'addListener', 'removeListener', 'prependListener', 'prependOnceListener'] =
    ['on', 'once', 'off', 'addListener', 'removeListener', 'prependListener', 'prependOnceListener']

  for (const method of eventHandlerMethods) {
    expectAssignable<Dispatcher>(dispatcher[method]('connect', eventHandler['connect']))
    expectAssignable<Dispatcher>(dispatcher[method]('disconnect', eventHandler['disconnect']))
    expectAssignable<Dispatcher>(dispatcher[method]('connectionError', eventHandler['connectionError']))
    expectAssignable<Dispatcher>(dispatcher[method]('drain', eventHandler['drain']))
  }

  const origin = new URL('')
  const targets = new Array<Dispatcher>()
  const error = new Errors.UndiciError()
  expectAssignable<boolean>(dispatcher.emit('connect', origin, targets))
  expectAssignable<boolean>(dispatcher.emit('disconnect', origin, targets, error))
  expectAssignable<boolean>(dispatcher.emit('connectionError', origin, targets, error))
  expectAssignable<boolean>(dispatcher.emit('drain', origin))
}
