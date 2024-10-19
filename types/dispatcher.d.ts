import { URL } from 'url'
import { Duplex, Readable } from 'stream'
import { EventEmitter } from 'events'
import { Blob } from 'buffer'
import { IncomingHttpHeaders } from './header'
import BodyReadable from './readable'
import { FormData } from './formdata'
import Errors from './errors'
import { Autocomplete } from './utility'

type AbortSignal = unknown

export default Dispatcher

/** Dispatcher is the core API used to dispatch requests. */
declare class Dispatcher extends EventEmitter {
  /** Dispatches a request. This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this. */
  dispatch (options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandlers): boolean
  /** Compose a chain of dispatchers */
  compose (dispatchers: Dispatcher.DispatcherComposeInterceptor[]): Dispatcher.ComposedDispatcher
  compose (...dispatchers: Dispatcher.DispatcherComposeInterceptor[]): Dispatcher.ComposedDispatcher
  /** Performs an HTTP request. */
  request<TOpaque = null>(options: Dispatcher.RequestOptions<TOpaque>): Promise<Dispatcher.ResponseData<TOpaque>>
  request<TOpaque = null>(options: Dispatcher.RequestOptions<TOpaque>, callback: (err: Error | null, data: Dispatcher.ResponseData<TOpaque>) => void): void
  /** Closes the client and gracefully waits for enqueued requests to complete before invoking the callback (or returning a promise if no callback is provided). */
  close (): Promise<void>
  close (callback: () => void): void
  /** Destroy the client abruptly with the given err. All the pending and running requests will be asynchronously aborted and error. Waits until socket is closed before invoking the callback (or returning a promise if no callback is provided). Since this operation is asynchronously dispatched there might still be some progress on dispatched requests. */
  destroy (): Promise<void>
  destroy (err: Error | null): Promise<void>
  destroy (callback: () => void): void
  destroy (err: Error | null, callback: () => void): void

  on (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  on (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  on (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  on (eventName: 'drain', callback: (origin: URL) => void): this

  once (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  once (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  once (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  once (eventName: 'drain', callback: (origin: URL) => void): this

  off (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  off (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  off (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  off (eventName: 'drain', callback: (origin: URL) => void): this

  addListener (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  addListener (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  addListener (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  addListener (eventName: 'drain', callback: (origin: URL) => void): this

  removeListener (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  removeListener (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  removeListener (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  removeListener (eventName: 'drain', callback: (origin: URL) => void): this

  prependListener (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  prependListener (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  prependListener (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  prependListener (eventName: 'drain', callback: (origin: URL) => void): this

  prependOnceListener (eventName: 'connect', callback: (origin: URL, targets: readonly Dispatcher[]) => void): this
  prependOnceListener (eventName: 'disconnect', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  prependOnceListener (eventName: 'connectionError', callback: (origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void): this
  prependOnceListener (eventName: 'drain', callback: (origin: URL) => void): this

  listeners (eventName: 'connect'): ((origin: URL, targets: readonly Dispatcher[]) => void)[]
  listeners (eventName: 'disconnect'): ((origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void)[]
  listeners (eventName: 'connectionError'): ((origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void)[]
  listeners (eventName: 'drain'): ((origin: URL) => void)[]

  rawListeners (eventName: 'connect'): ((origin: URL, targets: readonly Dispatcher[]) => void)[]
  rawListeners (eventName: 'disconnect'): ((origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void)[]
  rawListeners (eventName: 'connectionError'): ((origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError) => void)[]
  rawListeners (eventName: 'drain'): ((origin: URL) => void)[]

  emit (eventName: 'connect', origin: URL, targets: readonly Dispatcher[]): boolean
  emit (eventName: 'disconnect', origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError): boolean
  emit (eventName: 'connectionError', origin: URL, targets: readonly Dispatcher[], error: Errors.UndiciError): boolean
  emit (eventName: 'drain', origin: URL): boolean
}

declare namespace Dispatcher {
  export interface ComposedDispatcher extends Dispatcher {}
  export type DispatcherComposeInterceptor = (dispatch: Dispatcher['dispatch']) => Dispatcher['dispatch']
  export interface DispatchOptions {
    origin?: string | URL;
    path: string;
    method: HttpMethod;
    /** Default: `null` */
    body?: string | Buffer | Uint8Array | Readable | null | FormData;
    /** Default: `null` */
    headers?: IncomingHttpHeaders | string[] | Iterable<[string, string | string[] | undefined]> | null;
    /** Query string params to be embedded in the request URL. Default: `null` */
    query?: Record<string, any>;
    /** Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceding requests in the pipeline have completed. Default: `true` if `method` is `HEAD` or `GET`. */
    idempotent?: boolean;
    /** Whether the response is expected to take a long time and would end up blocking the pipeline. When this is set to `true` further pipelining will be avoided on the same connection until headers have been received. */
    blocking?: boolean;
    /** Upgrade the request. Should be used to specify the kind of upgrade i.e. `'Websocket'`. Default: `method === 'CONNECT' || null`. */
    upgrade?: boolean | string | null;
    /** The amount of time, in milliseconds, the parser will wait to receive the complete HTTP headers. Defaults to 300 seconds. */
    headersTimeout?: number | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use 0 to disable it entirely. Defaults to 300 seconds. */
    bodyTimeout?: number | null;
    /** Whether the request should stablish a keep-alive or not. Default `false` */
    reset?: boolean;
    /** Whether Undici should throw an error upon receiving a 4xx or 5xx response from the server. Defaults to false */
    throwOnError?: boolean;
    /** For H2, it appends the expect: 100-continue header, and halts the request body until a 100-continue is received from the remote server */
    expectContinue?: boolean;
  }
  export interface RequestOptions<TOpaque = null> extends DispatchOptions {
    /** Default: `null` */
    opaque?: TOpaque;
    /** Default: `null` */
    signal?: AbortSignal | EventEmitter | null;
    /** Default: 0 */
    maxRedirections?: number;
    /** Default: false */
    redirectionLimitReached?: boolean;
    /** Default: `64 KiB` */
    highWaterMark?: number;
  }
  export interface ResponseData<TOpaque = null> {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: BodyReadable & BodyMixin;
    trailers: Record<string, string>;
    opaque: TOpaque;
    context: object;
  }
  export interface DispatchHandlers {
    /** Invoked before request is dispatched on socket. May be invoked multiple times when a request is retried when the request at the head of the pipeline fails. */
    onConnect?(abort: (err?: Error) => void): void;
    /** Invoked when an error has occurred. */
    onError?(err: Error): void;
    /** Invoked when request is upgraded either due to a `Upgrade` header or `CONNECT` method. */
    onUpgrade?(statusCode: number, headers: Buffer[] | string[] | null, socket: Duplex): void;
    /** Invoked when response is received, before headers have been read. **/
    onResponseStarted?(): void;
    /** Invoked when statusCode and headers have been received. May be invoked multiple times due to 1xx informational headers. */
    onHeaders?(statusCode: number, headers: Buffer[], resume: () => void, statusText: string): boolean;
    /** Invoked when response payload data is received. */
    onData?(chunk: Buffer): boolean;
    /** Invoked when response payload and trailers have been received and the request has completed. */
    onComplete?(trailers: string[] | null): void;
    /** Invoked when a body chunk is sent to the server. May be invoked multiple times for chunked requests */
    onBodySent?(chunkSize: number, totalBytesSent: number): void;
  }
  export type HttpMethod = Autocomplete<'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'CONNECT' | 'OPTIONS' | 'TRACE' | 'PATCH'>

  /**
   * @link https://fetch.spec.whatwg.org/#body-mixin
   */
  interface BodyMixin {
    readonly body?: never;
    readonly bodyUsed: boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
    blob(): Promise<Blob>;
    bytes(): Promise<Uint8Array>;
    formData(): Promise<never>;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }

  export interface DispatchInterceptor {
    (dispatch: Dispatcher['dispatch']): Dispatcher['dispatch']
  }
}
