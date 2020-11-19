import { URL } from 'url'
import { TlsOptions } from 'tls'
import { Duplex, Readable, Writable } from 'stream'
import { EventEmitter } from 'events'
import { IncomingHttpHeaders } from 'http'

type AbortSignal = unknown;

export = Client

/** A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default. */
declare class Client extends EventEmitter {
  constructor(url: string | URL, options?: Client.Options);

  /** Property to get and set the pipelining factor. */
  pipelining: number;
  /** Number of queued requests. */
  pending: number;
  /** Number of inflight requests. */
  running: number;
  /** Number of pending and running requests. */
  size: number;
  /** True if the client has an active connection. The client will lazily create a connection when it receives a request and will destroy it if there is no activity for the duration of the `timeout` value. */
  connected: boolean;
  /** True if pipeline is saturated or blocked. Indicates whether dispatching further requests is meaningful. */
  busy: boolean;
  /** True after `client.close()` has been called. */
  closed: boolean;
  /** True after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed. */
  destroyed: boolean;

  /** Performs a HTTP request */
  request(options: Client.RequestOptions): PromiseLike<Client.ResponseData>;
  request(options: Client.RequestOptions, callback: (err: Error | null, data: Client.ResponseData) => void): void;

  /** A faster version of `Client.request` */
  stream(options: Client.RequestOptions, factory: Client.StreamFactory): PromiseLike<Client.StreamData>;
  stream(options: Client.RequestOptions, factory: Client.StreamFactory, callback: (err: Error | null, data: Client.StreamData) => void): void;

  /** For easy use with `stream.pipeline` */
  pipeline(options: Client.PipelineOptions, handler: Client.PipelineHandler): Duplex;

  /** Upgrade to a different protocol */
  upgrade(options: Client.UpgradeOptions): PromiseLike<Client.UpgradeData>;
  upgrade(options: Client.UpgradeOptions, callback: (err: Error | null, data: Client.UpgradeData) => void): void;

  /** Starts two-way communications with the requested resource */
  connect(options: Client.ConnectOptions): PromiseLike<Client.ConnectData>;
  connect(options: Client.ConnectOptions, callback: (err: Error | null, data: Client.ConnectData) => void): void;

  /** This is the low level API which all the preceding APIs are implemented on top of. This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this. */
  dispatch(options: Client.DispatchOptions, handlers: Client.DispatchHandlers): void;

  /** Closes the client and gracefully waits for enqueued requests to complete before invoking the callback (or returnning a promise if no callback is provided). */
  close(): PromiseLike<void>;
  close(callback: () => void): void;

  /** Destroy the client abruptly with the given err. All the pending and running requests will be asynchronously aborted and error. Waits until socket is closed before invoking the callback (or returnning a promise if no callback is provided). Since this operation is asynchronously dispatched there might still be some progress on dispatched requests. */
  destroy(): PromiseLike<void>;
  destroy(err: Error | null): PromiseLike<void>;
  destroy(callback: () => void): void;
  destroy(err: Error | null, callback: () => void): void;
}

declare namespace Client {
  export interface Options {
    /** an IPC endpoint, either Unix domain socket or Windows named pipe. Default: `null`. */
    socketPath?: string | null;
    /** the timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overriden by *keep-alive* hints from the server. Default: `4e3` milliseconds (4s). */
    keepAliveTimeout?: number;
    /** the maximum allowed `idleTimeout` when overriden by *keep-alive* hints from the server. Default: `600e3` milliseconds (10min). */
    keepAliveMaxTimeout?: number;
    /** A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuries caused by e.g. transport latency. Default: `1e3` milliseconds (1s). */
    keepAliveTimeoutThreshold?: number;
    /** The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Default: `1`. */
    pipelining?: number;
    /** An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback). Default: `null`. */
    tls?: TlsOptions | null;
    /** The maximum length of request headers in bytes. Default: `16384` (16KiB). */
    maxHeaderSize?: number;
    /** The amount of time the parser will wait to receive the complete HTTP headers (Node 14 and above only). Default: `30e3` milliseconds (30s). */
    headersTimeout?: number;
  }

  export interface DispatchOptions {
    path: string;
    method: string;
    /** Default: `null` */
    body?: string | Buffer | Uint8Array | Readable | null;
    /** Default: `null` */
    headers?: IncomingHttpHeaders | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use 0 to disable it entirely. Default: `30e3` milliseconds (30s). */
    headersTimeout?: number;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving a body data. Use 0 to disable it entirely. Default: `30e3` milliseconds (30s). */
    bodyTimeout?: number;
    /** Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceeding requests in the pipeline has completed. Default: `true` if `method` is `HEAD` or `GET`. */
    idempotent?: boolean;
  }

  export interface RequestOptions extends DispatchOptions {
    opaque?: unknown;
    /** Default: `null` */
    signal?: AbortSignal | EventEmitter | null;
  }

  export interface PipelineOptions extends RequestOptions {
    /** `true` if the `handler` will return an object stream. Default: `false` */
    objectMode?: boolean;
  }

  export interface UpgradeOptions {
    path: string;
    method?: string;
    /** Default: `null` */
    headers?: IncomingHttpHeaders | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use 0 to disable it entirely. Default: `30e3` milliseconds (30s). */
    headersTimeout?: number;
    /** A string of comma separated protocols, in descending preference order. Default: `'Websocket'` */
    protocol?: string;
    /** Default: `null` */
    signal?: AbortSignal | EventEmitter | null;
  }

  export interface ConnectOptions {
    path: string;
    /** Default: `null` */
    headers?: IncomingHttpHeaders | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving a complete headers. Use 0 to disable it entirely. Default: `30e3` milliseconds (30s). */
    headersTimeout?: number;
    /** Default: `null` */
    signal?: AbortSignal | EventEmitter | null;
  }

  export interface ResponseData {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: Readable;
    opaque?: unknown;
  }

  export interface StreamData {
    opaque: unknown;
    trailers: Record<string, unknown>;
  }

  export interface UpgradeData {
    headers: IncomingHttpHeaders;
    socket: Duplex;
    opaque: unknown;
  }

  export interface ConnectData {
    statusCode: number;
    headers: IncomingHttpHeaders;
    socket: Duplex;
    opaque: unknown;
  }

  export interface StreamFactoryData {
    statusCode: number;
    headers: IncomingHttpHeaders;
    opaque: unknown;
  }
  export type StreamFactory = (data: StreamFactoryData) => Writable

  export interface PipelineHandlerData {
    statusCode: number;
    headers: IncomingHttpHeaders;
    opaque: unknown;
    body: Readable;
  }

  export type PipelineHandler = (data: PipelineHandlerData) => Readable

  export interface DispatchHandlers {
    /** Invoked before request is dispatched on socket. May be invoked multiple times when a request is retried when the request at the head of the pipeline fails. */
    onConnect?(abort: () => void): void;
    /** Invoked when request is upgraded either due to a `Upgrade` header or `CONNECT` method */
    onUpgrade?(statusCode: number, headers: string[] | null, socket: Duplex): void;
    /** Invoked when statusCode and headers have been received. May be invoked multiple times due to 1xx informational headers. */
    onHeaders?(statusCode: number, headers: string[] | null, resume: () => void): boolean;
    /** Invoked when response payload data is received */
    onData?(chunk: Buffer): boolean;
    /** Invoked when response payload and trailers have been received and the request has completed. */
    onComplete?(trailers: string[] | null): void;
    /** Invoked when an error has occurred. */
    onError?(err: Error): void;
  }
}
