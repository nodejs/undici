import { expectAssignable } from 'tsd'
import { errors } from '../..'
import Client from '../../types/client'

expectAssignable<errors.UndiciError>(new errors.UndiciError())

expectAssignable<errors.UndiciError>(new errors.ConnectTimeoutError())
expectAssignable<errors.ConnectTimeoutError>(new errors.ConnectTimeoutError())
expectAssignable<'ConnectTimeoutError'>(new errors.ConnectTimeoutError().name)
expectAssignable<'UND_ERR_CONNECT_TIMEOUT'>(new errors.ConnectTimeoutError().code)

expectAssignable<errors.UndiciError>(new errors.HeadersTimeoutError())
expectAssignable<errors.HeadersTimeoutError>(new errors.HeadersTimeoutError())
expectAssignable<'HeadersTimeoutError'>(new errors.HeadersTimeoutError().name)
expectAssignable<'UND_ERR_HEADERS_TIMEOUT'>(new errors.HeadersTimeoutError().code)

expectAssignable<errors.UndiciError>(new errors.HeadersOverflowError())
expectAssignable<errors.HeadersOverflowError>(new errors.HeadersOverflowError())
expectAssignable<'HeadersOverflowError'>(new errors.HeadersOverflowError().name)
expectAssignable<'UND_ERR_HEADERS_OVERFLOW'>(new errors.HeadersOverflowError().code)

expectAssignable<errors.UndiciError>(new errors.BodyTimeoutError())
expectAssignable<errors.BodyTimeoutError>(new errors.BodyTimeoutError())
expectAssignable<'BodyTimeoutError'>(new errors.BodyTimeoutError().name)
expectAssignable<'UND_ERR_BODY_TIMEOUT'>(new errors.BodyTimeoutError().code)

expectAssignable<errors.UndiciError>(new errors.ResponseStatusCodeError())
expectAssignable<errors.ResponseStatusCodeError>(new errors.ResponseStatusCodeError())
expectAssignable<'ResponseStatusCodeError'>(new errors.ResponseStatusCodeError().name)
expectAssignable<'UND_ERR_RESPONSE_STATUS_CODE'>(new errors.ResponseStatusCodeError().code)

expectAssignable<errors.UndiciError>(new errors.InvalidArgumentError())
expectAssignable<errors.InvalidArgumentError>(new errors.InvalidArgumentError())
expectAssignable<'InvalidArgumentError'>(new errors.InvalidArgumentError().name)
expectAssignable<'UND_ERR_INVALID_ARG'>(new errors.InvalidArgumentError().code)

expectAssignable<errors.UndiciError>(new errors.InvalidReturnValueError())
expectAssignable<errors.InvalidReturnValueError>(new errors.InvalidReturnValueError())
expectAssignable<'InvalidReturnValueError'>(new errors.InvalidReturnValueError().name)
expectAssignable<'UND_ERR_INVALID_RETURN_VALUE'>(new errors.InvalidReturnValueError().code)

expectAssignable<errors.UndiciError>(new errors.RequestAbortedError())
expectAssignable<errors.RequestAbortedError>(new errors.RequestAbortedError())
expectAssignable<'AbortError'>(new errors.RequestAbortedError().name)
expectAssignable<'UND_ERR_ABORTED'>(new errors.RequestAbortedError().code)

expectAssignable<errors.UndiciError>(new errors.InformationalError())
expectAssignable<errors.InformationalError>(new errors.InformationalError())
expectAssignable<'InformationalError'>(new errors.InformationalError().name)
expectAssignable<'UND_ERR_INFO'>(new errors.InformationalError().code)

expectAssignable<errors.UndiciError>(new errors.RequestContentLengthMismatchError())
expectAssignable<errors.RequestContentLengthMismatchError>(new errors.RequestContentLengthMismatchError())
expectAssignable<'RequestContentLengthMismatchError'>(new errors.RequestContentLengthMismatchError().name)
expectAssignable<'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'>(new errors.RequestContentLengthMismatchError().code)

expectAssignable<errors.UndiciError>(new errors.ResponseContentLengthMismatchError())
expectAssignable<errors.ResponseContentLengthMismatchError>(new errors.ResponseContentLengthMismatchError())
expectAssignable<'ResponseContentLengthMismatchError'>(new errors.ResponseContentLengthMismatchError().name)
expectAssignable<'UND_ERR_RES_CONTENT_LENGTH_MISMATCH'>(new errors.ResponseContentLengthMismatchError().code)

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
expectAssignable<Client.SocketInfo | null>(new errors.SocketError().socket)

expectAssignable<errors.UndiciError>(new errors.NotSupportedError())
expectAssignable<errors.NotSupportedError>(new errors.NotSupportedError())
expectAssignable<'NotSupportedError'>(new errors.NotSupportedError().name)
expectAssignable<'UND_ERR_NOT_SUPPORTED'>(new errors.NotSupportedError().code)

expectAssignable<errors.UndiciError>(new errors.BalancedPoolMissingUpstreamError())
expectAssignable<errors.BalancedPoolMissingUpstreamError>(new errors.BalancedPoolMissingUpstreamError())
expectAssignable<'MissingUpstreamError'>(new errors.BalancedPoolMissingUpstreamError().name)
expectAssignable<'UND_ERR_BPL_MISSING_UPSTREAM'>(new errors.BalancedPoolMissingUpstreamError().code)

expectAssignable<errors.UndiciError>(new errors.HTTPParserError())
expectAssignable<errors.HTTPParserError>(new errors.HTTPParserError())
expectAssignable<'HTTPParserError'>(new errors.HTTPParserError().name)

expectAssignable<errors.UndiciError>(new errors.ResponseExceededMaxSizeError())
expectAssignable<errors.ResponseExceededMaxSizeError>(new errors.ResponseExceededMaxSizeError())
expectAssignable<'ResponseExceededMaxSizeError'>(new errors.ResponseExceededMaxSizeError().name)
expectAssignable<'UND_ERR_RES_EXCEEDED_MAX_SIZE'>(new errors.ResponseExceededMaxSizeError().code)

{
  // @ts-ignore
  function f (): errors.HeadersTimeoutError | errors.ConnectTimeoutError { return }

  const e = f()

  if (e.code === 'UND_ERR_HEADERS_TIMEOUT') {
    expectAssignable<errors.HeadersTimeoutError>(e)
  } else if (e.code === 'UND_ERR_CONNECT_TIMEOUT') {
    expectAssignable<errors.ConnectTimeoutError>(e)
  }
}
