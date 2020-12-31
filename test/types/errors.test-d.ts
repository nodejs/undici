import { expectAssignable } from 'tsd'
import { errors } from '../..'

expectAssignable<errors.UndiciError>(new errors.UndiciError())

expectAssignable<errors.UndiciError>(new errors.HeadersTimeoutError())
expectAssignable<errors.HeadersTimeoutError>(new errors.HeadersTimeoutError())
expectAssignable<'HeadersTimeoutError'>(new errors.HeadersTimeoutError().name)
expectAssignable<'UND_ERR_HEADERS_TIMEOUT'>(new errors.HeadersTimeoutError().code)

expectAssignable<errors.UndiciError>(new errors.SocketTimeoutError())
expectAssignable<errors.SocketTimeoutError>(new errors.SocketTimeoutError())
expectAssignable<'SocketTimeoutError'>(new errors.SocketTimeoutError().name)
expectAssignable<'UND_ERR_SOCKET_TIMEOUT'>(new errors.SocketTimeoutError().code)

expectAssignable<errors.UndiciError>(new errors.InvalidReturnError())
expectAssignable<errors.InvalidReturnError>(new errors.InvalidReturnError())
expectAssignable<'InvalidReturnError'>(new errors.InvalidReturnError().name)
expectAssignable<'UND_ERR_INVALID_RETURN_VALUE'>(new errors.InvalidReturnError().code)

expectAssignable<errors.UndiciError>(new errors.RequestAbortedError())
expectAssignable<errors.RequestAbortedError>(new errors.RequestAbortedError())
expectAssignable<'RequestAbortedError'>(new errors.RequestAbortedError().name)
expectAssignable<'UND_ERR_ABORTED'>(new errors.RequestAbortedError().code)

expectAssignable<errors.UndiciError>(new errors.InformationalError())
expectAssignable<errors.InformationalError>(new errors.InformationalError())
expectAssignable<'InformationalError'>(new errors.InformationalError().name)
expectAssignable<'UND_ERR_INFO'>(new errors.InformationalError().code)

expectAssignable<errors.UndiciError>(new errors.ContentLengthMismatchError())
expectAssignable<errors.ContentLengthMismatchError>(new errors.ContentLengthMismatchError())
expectAssignable<'ContentLengthMismatchError'>(new errors.ContentLengthMismatchError().name)
expectAssignable<'UND_ERR_CONTENT_LENGTH_MISMATCH'>(new errors.ContentLengthMismatchError().code)

expectAssignable<errors.UndiciError>(new errors.ClientDestroyedError())
expectAssignable<errors.ClientDestroyedError>(new errors.ClientDestroyedError())
expectAssignable<'ClientDestroyedError'>(new errors.ClientDestroyedError().name)
expectAssignable<'UND_ERR_DESTROYED'>(new errors.ClientDestroyedError().code)

expectAssignable<errors.UndiciError>(new errors.ClientClosedError())
expectAssignable<errors.ClientClosedError>(new errors.ClientClosedError())
expectAssignable<'ClientClosedError'>(new errors.ClientClosedError().name)
expectAssignable<'UND_ERR_CLOSED'>(new errors.ClientClosedError().code)

expectAssignable<errors.UndiciError>(new errors.SocketError())
expectAssignable<errors.SocketError>(new errors.SocketError())
expectAssignable<'SocketError'>(new errors.SocketError().name)
expectAssignable<'UND_ERR_SOCKET'>(new errors.SocketError().code)

expectAssignable<errors.UndiciError>(new errors.NotSupportedError())
expectAssignable<errors.NotSupportedError>(new errors.NotSupportedError())
expectAssignable<'NotSupportedError'>(new errors.NotSupportedError().name)
expectAssignable<'UND_ERR_NOT_SUPPORTED'>(new errors.NotSupportedError().code)

{
  // @ts-ignore
  function f (): errors.HeadersTimeoutError | errors.SocketTimeoutError { return }

  const e = f()

  if (e.code === 'UND_ERR_HEADERS_TIMEOUT') {
    expectAssignable<errors.HeadersTimeoutError>(e)
  } else if (e.code === 'UND_ERR_SOCKET_TIMEOUT') {
    expectAssignable<errors.SocketTimeoutError>(e)
  }
}
