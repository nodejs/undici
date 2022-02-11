import { URL } from 'url'
import { Blob } from 'buffer'
import { expectType, expectError } from 'tsd'
import {
  BodyInit,
  fetch,
  FormData,
  Headers,
  HeadersInit,
  Request,
  RequestCache,
  RequestCredentials,
  RequestDestination,
  RequestInit,
  RequestMode,
  RequestRedirect,
  Response,
  ResponseInit,
  ResponseType,
  ReferrerPolicy
} from '../..'

const requestInit: RequestInit = {}
const responseInit: ResponseInit = { status: 200, statusText: 'OK' }

declare const request: Request
declare const headers: Headers
declare const response: Response

expectType<string | undefined>(requestInit.method)
expectType<boolean | undefined>(requestInit.keepalive)
expectType<HeadersInit | undefined>(requestInit.headers)
expectType<BodyInit | undefined>(requestInit.body)
expectType<RequestRedirect | undefined>(requestInit.redirect)
expectType<string | undefined>(requestInit.integrity)
expectType<AbortSignal | undefined>(requestInit.signal)
expectType<RequestCredentials | undefined>(requestInit.credentials)
expectType<RequestMode | undefined>(requestInit.mode)
expectType<string | undefined>(requestInit.referrer);
expectType<ReferrerPolicy | undefined>(requestInit.referrerPolicy)
expectType<null | undefined>(requestInit.window)

expectType<number | undefined>(responseInit.status)
expectType<string | undefined>(responseInit.statusText)
expectType<HeadersInit | undefined>(responseInit.headers)

expectType<Headers>(new Headers())
expectType<Headers>(new Headers({}))
expectType<Headers>(new Headers([]))
expectType<Headers>(new Headers(headers))
expectType<Headers>(new Headers(undefined))

expectType<Request>(new Request(request))
expectType<Request>(new Request('https://example.com'))
expectType<Request>(new Request(new URL('https://example.com')))
expectType<Request>(new Request(request, requestInit))
expectType<Request>(new Request('https://example.com', requestInit))
expectType<Request>(new Request(new URL('https://example.com'), requestInit))

expectType<Promise<Response>>(fetch(request))
expectType<Promise<Response>>(fetch('https://example.com'))
expectType<Promise<Response>>(fetch(new URL('https://example.com')))
expectType<Promise<Response>>(fetch(request, requestInit))
expectType<Promise<Response>>(fetch('https://example.com', requestInit))
expectType<Promise<Response>>(fetch(new URL('https://example.com'), requestInit))

expectType<Response>(new Response())
expectType<Response>(new Response(null))
expectType<Response>(new Response('string'))
expectType<Response>(new Response(new Blob([])))
expectType<Response>(new Response(new FormData()))
expectType<Response>(new Response(new Int8Array()))
expectType<Response>(new Response(new Uint8Array()))
expectType<Response>(new Response(new Uint8ClampedArray()))
expectType<Response>(new Response(new Int16Array()))
expectType<Response>(new Response(new Uint16Array()))
expectType<Response>(new Response(new Int32Array()))
expectType<Response>(new Response(new Uint32Array()))
expectType<Response>(new Response(new Float32Array()))
expectType<Response>(new Response(new Float64Array()))
expectType<Response>(new Response(new BigInt64Array()))
expectType<Response>(new Response(new BigUint64Array()))
expectType<Response>(new Response(new ArrayBuffer(0)))
expectType<Response>(new Response(null, responseInit))
expectType<Response>(new Response('string', responseInit))
expectType<Response>(new Response(new Blob([]), responseInit))
expectType<Response>(new Response(new FormData(), responseInit))
expectType<Response>(new Response(new Int8Array(), responseInit))
expectType<Response>(new Response(new Uint8Array(), responseInit))
expectType<Response>(new Response(new Uint8ClampedArray(), responseInit))
expectType<Response>(new Response(new Int16Array(), responseInit))
expectType<Response>(new Response(new Uint16Array(), responseInit))
expectType<Response>(new Response(new Int32Array(), responseInit))
expectType<Response>(new Response(new Uint32Array(), responseInit))
expectType<Response>(new Response(new Float32Array(), responseInit))
expectType<Response>(new Response(new Float64Array(), responseInit))
expectType<Response>(new Response(new BigInt64Array(), responseInit))
expectType<Response>(new Response(new BigUint64Array(), responseInit))
expectType<Response>(new Response(new ArrayBuffer(0), responseInit))
expectType<Response>(Response.error())
expectType<Response>(Response.redirect('https://example.com', 301))
expectType<Response>(Response.redirect('https://example.com', 302))
expectType<Response>(Response.redirect('https://example.com', 303))
expectType<Response>(Response.redirect('https://example.com', 307))
expectType<Response>(Response.redirect('https://example.com', 308))
expectError(Response.redirect('https://example.com', NaN))

expectType<void>(headers.append('key', 'value'))
expectType<void>(headers.delete('key'))
expectType<string | null>(headers.get('key'))
expectType<boolean>(headers.has('key'))
expectType<void>(headers.set('key', 'value'))
expectType<IterableIterator<string>>(headers.keys())
expectType<IterableIterator<string>>(headers.values())
expectType<IterableIterator<[string, string]>>(headers.entries())

expectType<RequestCache>(request.cache)
expectType<RequestCredentials>(request.credentials)
expectType<RequestDestination>(request.destination)
expectType<Headers>(request.headers)
expectType<string>(request.integrity)
expectType<string>(request.method)
expectType<RequestMode>(request.mode)
expectType<RequestRedirect>(request.redirect)
expectType<string>(request.referrerPolicy)
expectType<string>(request.url)
expectType<boolean>(request.keepalive)
expectType<AbortSignal>(request.signal)
expectType<boolean>(request.bodyUsed)
expectType<Promise<ArrayBuffer>>(request.arrayBuffer())
expectType<Promise<Blob>>(request.blob())
expectType<Promise<FormData>>(request.formData())
expectType<Promise<unknown>>(request.json())
expectType<Promise<string>>(request.text())
expectType<Request>(request.clone())

expectType<Headers>(response.headers)
expectType<boolean>(response.ok)
expectType<number>(response.status)
expectType<string>(response.statusText)
expectType<ResponseType>(response.type)
expectType<string>(response.url)
expectType<boolean>(response.redirected)
expectType<boolean>(response.bodyUsed)
expectType<Promise<ArrayBuffer>>(response.arrayBuffer())
expectType<Promise<Blob>>(response.blob())
expectType<Promise<FormData>>(response.formData())
expectType<Promise<unknown>>(response.json())
expectType<Promise<string>>(response.text())
expectType<Response>(response.clone())
