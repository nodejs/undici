import { URL } from 'url'
import Dispatcher from './dispatcher'
import Pool from './pool'

export = Agent

declare class Agent extends Dispatcher{
  constructor(opts?: Agent.Options)
  /** Number of queued requests. */
  pending: number;
  /** Number of inflight requests. */
  running: number;
  /** Number of pending and running requests. */
  size: number;
  /** Number of active client connections. */
  connected: number;
  /** Dispatches a request. */
  dispatch(options: Agent.DispatchOptions, handler: Dispatcher.DispatchHandlers): void;
}

declare namespace Agent {
  export interface Options extends Pool.Options {
    /** Default: `(origin, opts) => new Pool(origin, opts)`. */
    factory?(origin: URL, opts: Object): Dispatcher;
    /** Integer. Default: `0` */
    maxRedirections?: number;
  }

  export interface DispatchOptions extends Dispatcher.DispatchOptions {
    /** Integer. */
    maxRedirections?: number;
  }
}
