import Client from './client'
import Dispatcher, { DispatchOptions, RequestOptions } from './dispatcher'
import { URL } from 'url'

export = Pool

declare class Pool extends Dispatcher {
  constructor(url: string | URL, options?: Pool.Options)
  /** `true` after `pool.close()` has been called. */
  closed: boolean;
  /** `true` after `pool.destroyed()` has been called or `pool.close()` has been called and the pool shutdown has completed. */
  destroyed: boolean;
  /** Dispatches a request. This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this. */
  dispatch(options: Pool.PoolDispatchOptions, handler: Dispatcher.DispatchHandlers): void;
  /** Performs an HTTP request. */
  request(options: Pool.PoolRequestOptions): Promise<Dispatcher.ResponseData>;
  request(options: Pool.PoolRequestOptions, callback: (err: Error | null, data: Dispatcher.ResponseData) => void): void;
}

declare namespace Pool {
  export interface Options extends Client.Options {
    /** Default: `(origin, opts) => new Client(origin, opts)`. */
    factory?(origin: URL, opts: object): Dispatcher;
    /** The max number of clients to create. `null` if no limit. Default `null`. */
    connections?: number | null;
  }

  export interface PoolDispatchOptions extends Partial<DispatchOptions> {
    origin?: string | URL;
  }

  export interface PoolRequestOptions extends Partial<RequestOptions> {
    origin?: string | URL;
  }
}
