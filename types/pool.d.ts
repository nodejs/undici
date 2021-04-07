import Client from './client'
import Dispatcher from './dispatcher'
import { URL } from 'url'

export = Pool

declare class Pool extends Dispatcher {
  constructor(url: string | URL, options?: Pool.Options)
  /** Number of queued requests. */
  pending: number;
  /** Number of inflight requests. */
  running: number;
  /** Number of pending and running requests. */
  size: number;
  /** Number of active client connections. The clients will lazily create a connection when it receives a request and will destroy it if there is no activity for the duration of the `timeout` value. */
  connected: number;
  /** `true` if pipeline is saturated or blocked. Indicates whether dispatching further requests is meaningful. */
  busy: boolean;
  /** `true` after `pool.close()` has been called. */
  closed: boolean;
  /** `true` after `pool.destroyed()` has been called or `pool.close()` has been called and the pool shutdown has completed. */
  destroyed: boolean;
  /** The URL of the Pool instance. */
  readonly url: URL;
}

declare namespace Pool {
  export interface Options extends Client.Options {
    /** Default: `(origin, opts) => new Client(origin, opts)`. */
    factory?(origin: URL, opts: object): Dispatcher;
    /** The max number of clients to create. `null` if no limit. Default `null`. */
    connections?: number | null;
  }
}
