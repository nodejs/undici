import { URL } from 'node:url'
import { SessionOptions } from 'node:http2'
import Dispatcher from './dispatcher'
import buildConnector from './connector'
import TClientStats from './client-stats'

type ClientConnectOptions<TOpaque = null> = Omit<Dispatcher.ConnectOptions<TOpaque>, 'origin'>

// TODO: Pendings
// 1. Reflect this on Client instantiation
// 2. Client H2 should use this namespaced options instead.

/**
 * A basic HTTP/1.1 client, mapped on top a single TCP/TLS connection. Pipelining is disabled by default.
 */
export class Client extends Dispatcher {
  constructor (url: string | URL, options?: Client.Options)
  /** Property to get and set the pipelining factor. */
  pipelining: number
  /** `true` after `client.close()` has been called. */
  closed: boolean
  /** `true` after `client.destroyed()` has been called or `client.close()` has been called and the client shutdown has completed. */
  destroyed: boolean
  /** Aggregate stats for a Client. */
  readonly stats: TClientStats

  // Override dispatcher APIs.
  override connect<TOpaque = null> (
    options: ClientConnectOptions<TOpaque>
  ): Promise<Dispatcher.ConnectData<TOpaque>>
  override connect<TOpaque = null> (
    options: ClientConnectOptions<TOpaque>,
    callback: (err: Error | null, data: Dispatcher.ConnectData<TOpaque>) => void
  ): void
}

export declare namespace Client {
  export interface Options {
    /** The maximum length of request headers in bytes. Default: Node.js' `--max-http-header-size` or `16384` (16KiB). */
    maxHeaderSize?: number | undefined;
    /** The amount of time, in milliseconds, the parser will wait to receive the complete HTTP headers (Node 14 and above only). Default: `300e3` milliseconds (300s). HTTP/1.1 parser timeouts are not guaranteed to fire with exact millisecond precision: delays up to 1000ms use native timers, while larger delays use lower-overhead fast timers with a target resolution around 500ms. */
    headersTimeout?: number | undefined;
    /** @deprecated unsupported socketTimeout, use headersTimeout & bodyTimeout instead */
    socketTimeout?: never | undefined;
    /** @deprecated unsupported requestTimeout, use headersTimeout & bodyTimeout instead */
    requestTimeout?: never | undefined;
    /** The timeout for establishing a socket connection, in milliseconds. Use `0` to disable it entirely. Default: `10e3` milliseconds (10s). */
    connectTimeout?: number | undefined;
    /** The timeout after which a request will time out, in milliseconds. Monitors time between receiving body data. Use `0` to disable it entirely. Default: `300e3` milliseconds (300s). HTTP/1.1 parser timeouts are not guaranteed to fire with exact millisecond precision: delays up to 1000ms use native timers, while larger delays use lower-overhead fast timers with a target resolution around 500ms. */
    bodyTimeout?: number | undefined;
    /** @deprecated unsupported idleTimeout, use keepAliveTimeout instead */
    idleTimeout?: never | undefined;
    /** @deprecated unsupported keepAlive, use pipelining=0 instead */
    keepAlive?: never | undefined;
    /** the timeout, in milliseconds, after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overridden by *keep-alive* hints from the server. Default: `4e3` milliseconds (4s). */
    keepAliveTimeout?: number | undefined;
    /** @deprecated unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead */
    maxKeepAliveTimeout?: never | undefined;
    /** the maximum allowed `idleTimeout`, in milliseconds, when overridden by *keep-alive* hints from the server. Default: `600e3` milliseconds (10min). */
    keepAliveMaxTimeout?: number | undefined;
    /** A number of milliseconds subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuracies caused by e.g. transport latency. Default: `1e3` milliseconds (1s). */
    keepAliveTimeoutThreshold?: number | undefined;
    /** An IPC endpoint, either a Unix domain socket or Windows named pipe. Default: `null`. */
    socketPath?: string | undefined;
    /** The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Only enable values greater than `1` when the remote server is trusted. Default: `1`. */
    pipelining?: number | undefined;
    /** @deprecated use the connect option instead */
    tls?: never | undefined;
    /** If `true`, an error is thrown when the request content-length header doesn't match the length of the request body. Default: `true`. */
    strictContentLength?: boolean | undefined;
    /** Maximum number of TLS cached sessions used by the built-in connector. Use `0` to disable TLS session caching. Default: `100`. */
    maxCachedSessions?: number | undefined;
    /** Connector options passed to `buildConnector`, or a custom connector function. Default: `null`. */
    connect?: Partial<buildConnector.BuildOptions> | buildConnector.connector | undefined;
    /** The maximum number of requests to send over a single connection before it is reset. Use `0` to disable this limit. Default: `null`. */
    maxRequestsPerClient?: number | undefined;
    /** Local IP address the socket should connect from. */
    localAddress?: string | undefined;
    /** Max response body size in bytes, -1 is disabled */
    maxResponseSize?: number | undefined;
    /** WebSocket-specific options */
    webSocket?: Client.WebSocketOptions | undefined;
    /** EventSource-specific options */
    eventSource?: Client.EventSourceOptions | undefined;
    /** Enables a family autodetection algorithm that loosely implements section 5 of RFC 8305. */
    autoSelectFamily?: boolean | undefined;
    /** The amount of time in milliseconds to wait for a connection attempt to finish before trying the next address when using the `autoSelectFamily` option. */
    autoSelectFamilyAttemptTimeout?: number | undefined;
    /**
     * @description Enables support for H2 if the server has assigned bigger priority to it through ALPN negotiation.
     * @default true
     */
    allowH2?: boolean | undefined;
    /**
     * @description Dictates the maximum number of concurrent streams for a single H2 session. It can be overridden by a SETTINGS remote frame.
     * @default 100
     * @deprecated Use h2Options.maxConcurrentStreams instead
     */
    maxConcurrentStreams?: number | undefined;
    /**
     * @description Sets the HTTP/2 stream-level flow-control window size (SETTINGS_INITIAL_WINDOW_SIZE).
     * @default 262144
     * @deprecated Use h2Options.settings.initialWindowSize instead
     */
    initialWindowSize?: number | undefined;
    /**
     * @description Sets the HTTP/2 connection-level flow-control window size (ClientHttp2Session.setLocalWindowSize).
     * @default 524288
     * @deprecated Use h2Options.connectionWindowSize instead
     */
    connectionWindowSize?: number | undefined;
    /**
     * @description Time interval between PING frames dispatch
     * @default 60000
     * @deprecated Use h2Options.connectionWindowSize instead
     */
    pingInterval?: number | undefined;
    /**
     * @description HTTP/2 configuration options
     */
    h2Options?: Client.H2Options | undefined;
  }
  export interface SocketInfo {
    localAddress?: string | undefined
    localPort?: number | undefined
    remoteAddress?: string | undefined
    remotePort?: number | undefined
    remoteFamily?: string | undefined
    timeout?: number | undefined
    bytesWritten?: number | undefined
    bytesRead?: number | undefined
  }
  export interface WebSocketOptions {
    /**
     * Maximum number of fragments in a message. Set to 0 to disable the limit.
     * @default 131072
     */
    maxFragments?: number | undefined;
    /**
     * Maximum allowed payload size in bytes for WebSocket messages.
     * Applied to uncompressed messages, compressed frame payloads, and decompressed (permessage-deflate) messages.
     * Set to 0 to disable the limit.
     * @default 134217728 (128 MB)
     */
    maxPayloadSize?: number | undefined;
  }

  export interface H2Options extends Omit<SessionOptions, keyof buildConnector.BuildOptions> {
    /**
     * @description Sets the HTTP/2 connection-level flow-control window size (ClientHttp2Session.setLocalWindowSize).
     * @default 524288
     */
    connectionWindowSize?: number | undefined;
    /**
     * @description Time interval between PING frames dispatch
     * @default 60000
     */
    pingInterval?: number | undefined;
    /**
     * @description Dictates the maximum number of concurrent streams for a single H2 session. It can be overridden by a SETTINGS remote frame.
     * @default 100
    */
    maxConcurrentStreams?: number | undefined;
    /**
     * @description Enable support for H2C (plain text)
     * @default false
     */
    useH2c?: boolean | undefined;
    /**
     * @description SETTINGS frame object. Default to 'node:http2' defaults
     */
    settings?: Omit<SessionOptions['settings'], 'enablePush' | 'maxConcurrentStreams' | 'enableConnectProtocol'> | undefined
  }
  export interface EventSourceOptions {
    /**
     * Maximum allowed event size in bytes for EventSource messages.
     * Set to 0 to disable the limit.
     * @default buffer.kStringMaxLength
     */
    maxEventSize?: number | undefined;
  }
}

export default Client
