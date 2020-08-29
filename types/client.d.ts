import { URL } from 'url'
import { TlsOptions } from 'tls'

export = Client

declare class Client {
	constructor(url: string | URL, options: Client.Options)
}

declare namespace Client {
	export interface Options {
		/** the timeout after which a socket with active requests will time out. Monitors time between activity on a connected socket. Use `0` to disable it entirely. Default: `30e3` milliseconds (30s). */
		socketTimeout?: number;
		/** an IPC endpoint, either Unix domain socket or Windows named pipe. Default: `null`. */
		socketPath?: string | null;
		/** the timeout after which a socket without active requests will time out. Monitors time between activity on a connected socket. This value may be overriden by *keep-alive* hints from the server. Default: `4e3` milliseconds (4s). */
		idleTimeout?: number;
		/** enable or disable keep alive connections. Default: `true`. */
		keepAlive?: boolean;
		/** the maximum allowed `idleTimeout` when overriden by *keep-alive* hints from the server. Default: `600e3` milliseconds (10min). */
		keepAliveMaxTimeout?: number;
		/** A number subtracted from server *keep-alive* hints when overriding `idleTimeout` to account for timing inaccuries caused by e.g. transport latency. Default: `1e3` milliseconds (1s). */
		keepAliveTimeoutThreshold?: number;
		/** The timeout after which a request will time out. Monitors time between request is dispatched on socket and receiving a response. Use `0` to disable it entirely. Default: `30e3` milliseconds (30s). */
		requestTimeout?: number;
		/** The amount of concurrent requests to be sent over the single TCP/TLS connection according to [RFC7230](https://tools.ietf.org/html/rfc7230#section-6.3.2). Default: `1`. */
		pipelining?: number;
		/** An options object which in the case of `https` will be passed to [`tls.connect`](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback). Default: `null`. */
		tls?: TlsOptions | null;
		/** The maximum length of request headers in bytes. Default: `16384` (16KiB). */
		maxHeaderSize?: number;
		/** The amount of time the parser will wait to receive the complete HTTP headers (Node 14 and above only). Default: `30e3` milliseconds (30s). */
		headersTimeout?: number;
	}
}