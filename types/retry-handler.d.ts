import Dispatcher from './dispatcher'

export default RetryHandler

declare class RetryHandler implements Dispatcher.DispatchHandler {
  constructor (
    options: Dispatcher.DispatchOptions & {
      retryOptions?: RetryHandler.RetryOptions;
    },
    retryHandlers: RetryHandler.RetryHandlers
  )
}

declare namespace RetryHandler {
  export type RetryState = { counter: number }

  export type RetryContext = {
    state: RetryState;
    opts: Dispatcher.DispatchOptions & {
      retryOptions?: RetryHandler.RetryOptions;
    };
  }

  export type OnRetryCallback = (result?: Error | null) => void

  export type RetryCallback = (
    err: Error,
    context: {
      state: RetryState;
      opts: Dispatcher.DispatchOptions & {
        retryOptions?: RetryHandler.RetryOptions;
      };
    },
    callback: OnRetryCallback
  ) => void

  export interface RetryOptions {
    /**
     * Callback to be invoked on every retry iteration.
     * It receives the error, current state of the retry object and the options object
     * passed when instantiating the retry handler.
     *
     * @type {RetryCallback}
     * @memberof RetryOptions
     */
    retry?: RetryCallback;
    /**
     * Maximum number of retries to allow.
     *
     * @type {number}
     * @memberof RetryOptions
     * @default 5
     */
    maxRetries?: number;
    /**
     * Max number of milliseconds allow between retries
     *
     * @type {number}
     * @memberof RetryOptions
     * @default 30000
     */
    maxTimeout?: number;
    /**
     * Initial number of milliseconds to wait before retrying for the first time.
     *
     * @type {number}
     * @memberof RetryOptions
     * @default 500
     */
    minTimeout?: number;
    /**
     * Factior to multiply the timeout factor between retries.
     *
     * @type {number}
     * @memberof RetryOptions
     * @default 2
     */
    timeoutFactor?: number;
    /**
     * It enables to automatically infer timeout between retries based on the `Retry-After` header.
     *
     * @type {boolean}
     * @memberof RetryOptions
     * @default true
     */
    retryAfter?: boolean;
    /**
     * HTTP methods to retry.
     *
     * @type {Dispatcher.HttpMethod[]}
     * @memberof RetryOptions
     * @default ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE'],
     */
    methods?: Dispatcher.HttpMethod[];
    /**
     * Error codes to be retried. e.g. `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED`, etc.
     *
     * @type {string[]}
     * @default ['ECONNRESET','ECONNREFUSED','ENOTFOUND','ENETDOWN','ENETUNREACH','EHOSTDOWN','EHOSTUNREACH','EPIPE']
     */
    errorCodes?: string[];
    /**
     * HTTP status codes to be retried.
     *
     * @type {number[]}
     * @memberof RetryOptions
     * @default [500, 502, 503, 504, 429],
     */
    statusCodes?: number[];

    /**
     * List of HTTP status codes that will not trigger a `RequestRetryError` directly in the handler.
     *
     * The error will only be thrown if the response status is in `statusCodes` and **not** in `noThrowStatusCodes`,
     * considering only status codes ≥ 300 and if it is the last attempt.
     *
     * On the last attempt (`maxRetries + 1`), if the status is in both lists (`statusCodes` and `noThrowStatusCodes`),
     * the error **will not** be thrown, allowing the request to proceed normally.
     *
     * @type {number[]}
     * @memberof RetryOptions
     * @default []
     */
    noThrowStatusCodes?: number[];
  }

  export interface RetryHandlers {
    dispatch: Dispatcher['dispatch'];
    handler: Dispatcher.DispatchHandler;
  }
}
