import { expectAssignable } from 'tsd'
import {
  Agent,
  Client,
  Dispatcher,
  EventSource,
  MockAgent,
  Pool,
  ProxyAgent,
  RequestInit,
  ResponseInit,
  RetryHandler,
  WebSocket,
  interceptors,
  request
} from '../..'

// These assertions only mean something when the type tests run with
// `exactOptionalPropertyTypes: true` (see the `tsd` config in package.json):
// every optional property has to accept an explicit `undefined`, because
// undici treats a missing option and an `undefined` option the same way at
// runtime.

expectAssignable<Client.Options>({
  bodyTimeout: undefined,
  headersTimeout: undefined,
  keepAliveTimeout: undefined,
  maxHeaderSize: undefined,
  pipelining: undefined,
  connect: undefined,
  strictContentLength: undefined,
  allowH2: undefined
})

expectAssignable<Pool.Options>({
  connections: undefined,
  clientTtl: undefined,
  factory: undefined
})

expectAssignable<Agent.Options>({
  factory: undefined,
  maxOrigins: undefined,
  connections: undefined
})

expectAssignable<ProxyAgent.Options>({
  uri: '',
  auth: undefined,
  token: undefined,
  headers: undefined,
  requestTls: undefined,
  proxyTls: undefined,
  clientFactory: undefined
})

expectAssignable<MockAgent.Options>({
  agent: undefined,
  ignoreTrailingSlash: undefined,
  acceptNonStandardSearchParameters: undefined
})

expectAssignable<Dispatcher.DispatchOptions>({
  origin: '',
  path: '',
  method: 'GET',
  body: undefined,
  headers: undefined,
  query: undefined,
  idempotent: undefined,
  blocking: undefined,
  upgrade: undefined,
  bodyTimeout: undefined,
  headersTimeout: undefined,
  expectContinue: undefined,
  reset: undefined
})

expectAssignable<Dispatcher.RequestOptions>({
  origin: '',
  path: '',
  method: 'GET',
  opaque: undefined,
  onInfo: undefined,
  responseHeaders: undefined,
  highWaterMark: undefined
})

expectAssignable<Dispatcher.DispatchHandler>({
  onRequestStart: undefined,
  onRequestUpgrade: undefined,
  onResponseStart: undefined,
  onResponseData: undefined,
  onResponseEnd: undefined,
  onResponseError: undefined,
  onResponseStarted: undefined,
  onBodySent: undefined,
  onRequestSent: undefined
})

expectAssignable<RetryHandler.RetryOptions>({
  retry: undefined,
  maxRetries: undefined,
  maxTimeout: undefined,
  minTimeout: undefined,
  timeoutFactor: undefined,
  retryAfter: undefined,
  methods: undefined,
  statusCodes: undefined,
  errorCodes: undefined
})

expectAssignable<RequestInit>({
  method: undefined,
  headers: undefined,
  body: undefined,
  redirect: undefined,
  signal: undefined,
  dispatcher: undefined,
  duplex: undefined
})

expectAssignable<ResponseInit>({
  status: undefined,
  statusText: undefined,
  headers: undefined
})

expectAssignable<Parameters<typeof interceptors.retry>[0]>({
  maxRetries: undefined,
  methods: undefined
})

expectAssignable<Parameters<typeof interceptors.redirect>[0]>({
  maxRedirections: undefined,
  throwOnMaxRedirect: undefined
})

expectAssignable<Parameters<typeof request>[1]>({
  dispatcher: undefined,
  headers: undefined,
  body: undefined
})

// Constructing the classes with explicitly-undefined options must work too.
expectAssignable<Client>(new Client('http://localhost', { pipelining: undefined }))
expectAssignable<Pool>(new Pool('http://localhost', { connections: undefined }))
expectAssignable<Agent>(new Agent({ factory: undefined }))
expectAssignable<EventSource>(new EventSource('http://localhost', { withCredentials: undefined, dispatcher: undefined, node: undefined }))
expectAssignable<WebSocket>(new WebSocket('ws://localhost', { protocols: undefined, dispatcher: undefined, headers: undefined }))
