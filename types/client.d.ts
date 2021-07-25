import { URL } from 'url'
import { TlsOptions } from 'tls'
import Dispatcher, { DispatchOptions, RequestOptions } from './dispatcher'

export = Client

/** A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default. */
declare class Client extends Dispatcher {
  constructor(url: string | URL, options?: Client.Options);
  /** Property to get and set the pipelining factor. */
  pipelining: number;
  /** `true` after `client.close()` has been called. */
  closed: boolean;
  /** `true` after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed. */
  destroyed: boolean;
  /** Dispatches a request. This API is expected to evolve through semver-major versions and is less stable than the preceding higher level APIs. It is primarily intended for library developers who implement higher level APIs on top of this. */
  dispatch(options: Client.ClientDispatchOptions, handler: Dispatcher.DispatchHandlers): void;
  /** Performs an HTTP request. */
  request(options: Client.ClientRequestOptions): Promise<Dispatcher.ResponseData>;
  request(options: Client.ClientRequestOptions, callback: (err: Error | null, data: Dispatcher.ResponseData) => void): void;
}

declare namespace Client {
  export interface Options {
    /** the timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overridden by *keep-alive* hints from the server. Default: `4e3` milliseconds (4s). */
    keepAliveTimeout?: number | null;
    /** the maximum allowed `idleTimeout` when overridden by *keep-alive* hints from the server. Default: `600e3` milliseconds (10min). */
    keepAliveMaxTimeout?: number | null;
    /** A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuracies caused by e.g. transport latency. Default: `1e3` milliseconds (1s). */
    keepAliveTimeoutThreshold?: number | null;
    /** The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Default: `1`. */
    pipelining?: number | null;
    /** **/
    connect?: ConnectOptions | Function | null;
    /** The maximum length of request headers in bytes. Default: `16384` (16KiB). */
    maxHeaderSize?: number | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use `0` to disable it entirely. Default: `30e3` milliseconds (30s). */
    bodyTimeout?: number | null;
    /** The amount of time the parser will wait to receive the complete HTTP headers (Node 14 and above only). Default: `30e3` milliseconds (30s). */
    headersTimeout?: number | null;
    /** If `true`, an error is thrown when the request content-length header doesn't match the length of the request body. Default: `true`. */
    strictContentLength?: boolean;
    /** @deprecated use the connect option instead */
    tls?: TlsOptions | null;
  }

  export interface ConnectOptions extends TlsOptions {
    maxCachedSessions?: number | null;
    socketPath?: string | null;
    timeout?: number | null;
    servername?: string | null;
  }

  export interface ClientDispatchOptions extends Partial<DispatchOptions> {
    origin?: string | URL;
  }

  export interface ClientRequestOptions extends Partial<RequestOptions> {
    origin?: string | URL;
  }
}
