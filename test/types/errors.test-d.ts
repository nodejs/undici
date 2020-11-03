import { expectAssignable } from 'tsd'
import { Errors } from '../..'

expectAssignable<Errors.UndiciError>(new Errors.UndiciError())

expectAssignable<Errors.UndiciError>(new Errors.HeadersTimeoutError())
expectAssignable<Errors.HeadersTimeoutError>(new Errors.HeadersTimeoutError())
expectAssignable<'HeadersTimeoutError'>(new Errors.HeadersTimeoutError().name)
expectAssignable<'UND_ERR_HEADERS_TIMEOUT'>(new Errors.HeadersTimeoutError().code)

expectAssignable<Errors.UndiciError>(new Errors.SocketTimeoutError())
expectAssignable<Errors.SocketTimeoutError>(new Errors.SocketTimeoutError())
expectAssignable<'SocketTimeoutError'>(new Errors.SocketTimeoutError().name)
expectAssignable<'UND_ERR_SOCKET_TIMEOUT'>(new Errors.SocketTimeoutError().code)

expectAssignable<Errors.UndiciError>(new Errors.RequestTimeoutError())
expectAssignable<Errors.RequestTimeoutError>(new Errors.RequestTimeoutError())
expectAssignable<'RequestTimeoutError'>(new Errors.RequestTimeoutError().name)
expectAssignable<'UND_ERR_REQUEST_TIMEOUT'>(new Errors.RequestTimeoutError().code)

expectAssignable<Errors.UndiciError>(new Errors.InvalidReturnError())
expectAssignable<Errors.InvalidReturnError>(new Errors.InvalidReturnError())
expectAssignable<'InvalidReturnError'>(new Errors.InvalidReturnError().name)
expectAssignable<'UND_ERR_INVALID_RETURN_VALUE'>(new Errors.InvalidReturnError().code)

expectAssignable<Errors.UndiciError>(new Errors.RequestAbortedError())
expectAssignable<Errors.RequestAbortedError>(new Errors.RequestAbortedError())
expectAssignable<'RequestAbortedError'>(new Errors.RequestAbortedError().name)
expectAssignable<'UND_ERR_ABORTED'>(new Errors.RequestAbortedError().code)

expectAssignable<Errors.UndiciError>(new Errors.InformationalError())
expectAssignable<Errors.InformationalError>(new Errors.InformationalError())
expectAssignable<'InformationalError'>(new Errors.InformationalError().name)
expectAssignable<'UND_ERR_INFO'>(new Errors.InformationalError().code)

expectAssignable<Errors.UndiciError>(new Errors.ContentLengthMismatchError())
expectAssignable<Errors.ContentLengthMismatchError>(new Errors.ContentLengthMismatchError())
expectAssignable<'ContentLengthMismatchError'>(new Errors.ContentLengthMismatchError().name)
expectAssignable<'UND_ERR_CONTENT_LENGTH_MISMATCH'>(new Errors.ContentLengthMismatchError().code)

expectAssignable<Errors.UndiciError>(new Errors.ClientDestroyedError())
expectAssignable<Errors.ClientDestroyedError>(new Errors.ClientDestroyedError())
expectAssignable<'ClientDestroyedError'>(new Errors.ClientDestroyedError().name)
expectAssignable<'UND_ERR_DESTROYED'>(new Errors.ClientDestroyedError().code)

expectAssignable<Errors.UndiciError>(new Errors.ClientClosedError())
expectAssignable<Errors.ClientClosedError>(new Errors.ClientClosedError())
expectAssignable<'ClientClosedError'>(new Errors.ClientClosedError().name)
expectAssignable<'UND_ERR_CLOSED'>(new Errors.ClientClosedError().code)

expectAssignable<Errors.UndiciError>(new Errors.SocketError())
expectAssignable<Errors.SocketError>(new Errors.SocketError())
expectAssignable<'SocketError'>(new Errors.SocketError().name)
expectAssignable<'UND_ERR_SOCKET'>(new Errors.SocketError().code)

expectAssignable<Errors.UndiciError>(new Errors.NotSupportedError())
expectAssignable<Errors.NotSupportedError>(new Errors.NotSupportedError())
expectAssignable<'NotSupportedError'>(new Errors.NotSupportedError().name)
expectAssignable<'UND_ERR_NOT_SUPPORTED'>(new Errors.NotSupportedError().code)

{
	// @ts-ignore
	function f (): Errors.HeadersTimeoutError | Errors.SocketTimeoutError { return }

	const e = f()

	if (e.code === 'UND_ERR_HEADERS_TIMEOUT') {
		expectAssignable<Errors.HeadersTimeoutError>(e)
	} else if (e.code === 'UND_ERR_SOCKET_TIMEOUT') {
		expectAssignable<Errors.SocketTimeoutError>(e)
	}
}