import { URL } from 'url'
import { TlsOptions } from 'tls'
import Dispatcher from './dispatcher'

export = Client

/** A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default. */
declare class Client extends Dispatcher {
  constructor(url: string | URL, options?: Client.Options);
  /** Property to get and set the pipelining factor. */
  pipelining: number;
  /** Number of queued requests. */
  pending: number;
  /** Number of inflight requests. */
  running: number;
  /** Number of pending and running requests. */
  size: number;
  /** Number of active client connections. The client will lazily create a connection when it receives a request and will destroy it if there is no activity for the duration of the `timeout` value. */
  connected: number;
  /** `true` if pipeline is saturated or blocked. Indicates whether dispatching further requests is meaningful. */
  busy: boolean;
  /** `true` after `client.close()` has been called. */
  closed: boolean;
  /** `true` after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed. */
  destroyed: boolean;
  /** The URL of the Client instance. */
  readonly url: URL;
}

declare namespace Client {
  export interface Options {
    /** an IPC endpoint, either Unix domain socket or Windows named pipe. Default: `null`. */
    socketPath?: string | null;
    /** the timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overridden by *keep-alive* hints from the server. Default: `4e3` milliseconds (4s). */
    keepAliveTimeout?: number | null;
    /** the maximum allowed `idleTimeout` when overridden by *keep-alive* hints from the server. Default: `600e3` milliseconds (10min). */
    keepAliveMaxTimeout?: number | null;
    /** A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuracies caused by e.g. transport latency. Default: `1e3` milliseconds (1s). */
    keepAliveTimeoutThreshold?: number | null;
    /** The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Default: `1`. */
    pipelining?: number | null;
    /** An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback). Default: `null`. */
    tls?: TlsOptions | null;
    /** The maximum length of request headers in bytes. Default: `16384` (16KiB). */
    maxHeaderSize?: number | null;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use `0` to disable it entirely. Default: `30e3` milliseconds (30s). */
    bodyTimeout?: number | null;
    /** The amount of time the parser will wait to receive the complete HTTP headers (Node 14 and above only). Default: `30e3` milliseconds (30s). */
    headersTimeout?: number | null;
    /** If `true`, an error is thrown when the request content-length header doesn't match the length of the request body. Default: `true`. */
    strictContentLength?: boolean
  }
}
