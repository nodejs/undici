import Dispatcher from "./dispatcher";

export default RetryHandler;

declare class RetryHandler implements Dispatcher.DispatchHandlers {
  constructor(
    options: Dispatcher.DispatchOptions,
    retryHandlers: RetryHandler.RetryHandlers,
    retryOptions?: RetryHandler.RetryOptions
  );
}

declare namespace RetryHandler {
  export type RetryState = { counter: number; currentTimeout: number };

  export type RetryCallback = (
    err: Error,
    state: RetryState,
    opts: RetryOptions
  ) => number | null;

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
    max?: number;
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
     */
    methods?: Dispatcher.HttpMethod[];
    /**
     * It enables automatic retry between requets on idempotent methods.
     * The method should be defined as safe accordingly to https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP
     *
     * Note: It takes presedence over the `methods` option.
     * 
     * @type {boolean}
     * @memberof RetryOptions
     * @default false
     */
    idempotent?: boolean;
    /**
     * Error codes to be retried. e.g. `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED`, etc.
     *
     * @type {string[]}
     */
    codes?: string[];
    /**
     * HTTP status codes to be retried.
     *
     * @type {number[]}
     * @memberof RetryOptions
     */
    status?: number[];
  }

  export interface RetryHandlers {
    dispatch: Dispatcher["dispatch"];
    handler: Dispatcher.DispatchHandlers;
  }
}
