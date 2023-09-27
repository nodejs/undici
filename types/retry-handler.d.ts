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
    opts: Options
  ) => number | null;

  export interface RetryOptions {
    retry?: RetryCallback;
    max?: number;
    maxTimeout?: number;
    minTimeout?: number;
    timeoutFactor?: number;
    methods?: Dispatcher.HttpMethod[];
    idempotent?: boolean;
    codes?: string[];
    status?: number[];
  }

  export interface RetryHandlers {
    dispatch: Dispatcher["dispatch"];
    handler: Dispatcher.DispatchHandlers;
  }
};