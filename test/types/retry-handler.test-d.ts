import { expectType, expectAssignable, expectNotAssignable } from 'tsd'
import { Dispatcher, RetryHandler } from '../..'

// Test the basic structure of RetryCallback
expectType<RetryHandler.RetryCallback>((err, context, callback) => {
  expectType<Error>(err)
  expectType<{
    state: RetryHandler.RetryState;
    opts: Dispatcher.DispatchOptions & {
      retryOptions?: RetryHandler.RetryOptions;
    };
  }>(context)
  expectType<RetryHandler.OnRetryCallback>(callback)
})

// Test that RetryCallback returns void
const testCallback = (() => {}) as RetryHandler.RetryCallback
const testContext = {
  state: {} as RetryHandler.RetryState,
  opts: {} as Dispatcher.DispatchOptions & {
    retryOptions?: RetryHandler.RetryOptions;
  }
}

expectType<void>(testCallback(new Error(), testContext, () => {}))

// Test that the function is assignable to RetryCallback
expectAssignable<RetryHandler.RetryCallback>(testCallback)

// Test that an incorrectly typed function is not assignable to RetryCallback
expectNotAssignable<RetryHandler.RetryCallback>((() => {}) as (
  err: string,
  context: number,
  callback: boolean
) => void)

// Test the nested types
const contextTest: Parameters<RetryHandler.RetryCallback>[1] = {
  state: {} as RetryHandler.RetryState,
  opts: {
    method: 'GET',
    path: 'some-path',
    retryOptions: {} as RetryHandler.RetryOptions
  }
}
expectType<RetryHandler.RetryState>(contextTest.state)
expectType<
  Dispatcher.DispatchOptions & { retryOptions?: RetryHandler.RetryOptions }
>(contextTest.opts)
