import Agent = require('./agent')
import Dispatcher = require('./dispatcher')
import { Interceptable } from './mock-interceptor'

export = ProxyAgent

declare class ProxyAgent extends Dispatcher {
  constructor(options?: ProxyAgent.Options)

  get<TInterceptable extends Interceptable>(origin: string): TInterceptable;
  get<TInterceptable extends Interceptable>(origin: RegExp): TInterceptable;
  get<TInterceptable extends Interceptable>(origin: ((origin: string) => boolean)): TInterceptable;
  /** Dispatches a mocked request. */
  dispatch(options: Agent.DispatchOptions, handler: Dispatcher.DispatchHandlers): void;
  /** Closes the mock agent and waits for registered mock pools and clients to also close before resolving. */
  close(): Promise<void>;
}

declare namespace ProxyAgent {
  export interface Options extends Agent.Options {
  }
}
