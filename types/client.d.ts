import { URL } from 'url'
import { TlsOptions } from 'tls'
import { Readable } from 'stream'
import { EventEmitter } from 'events'
import Errors from './errors'

export = Client

declare class Client {
	constructor(url: string | URL, options: Client.Options);

	request(options: Client.RequestOptions): PromiseLike<Client.ResponseData>;
	request(options: Client.RequestOptions, callback: (err: Error | null, data: Client.ResponseData) => void): void;
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

	export interface RequestOptions {
		path: string;
		method: string;
		opaque?: unknown;
		body?: string | Buffer | Uint8Array | Readable | null;
		headers?: Headers | null;
		signal?: AbortController | EventEmitter | null;
		/** The timeout after which a request will time out, in milliseconds. Monitors time between request being enqueued and receiving a response. Use `0` to disable it entirely. Default: `30e3` milliseconds (30s). */
		requestTimeout?: number;
		/** Whether the requests can be safely retried or not. If `false` the request won't be sent until all preceeding requests in the pipeline has completed. Default: `true` if `method` is `HEAD` or `GET`. */
		idempotent?: boolean;
	}

	export interface ResponseData {
		statusCode: number;
		headers: Headers;
		body: Readable;
		opaque?: unknown;
	}

	export interface Headers {
		'accept'?: string;
		'accept-language'?: string;
		'accept-patch'?: string;
		'accept-ranges'?: string;
		'access-control-allow-credentials'?: string;
		'access-control-allow-headers'?: string;
		'access-control-allow-methods'?: string;
		'access-control-allow-origin'?: string;
		'access-control-expose-headers'?: string;
		'access-control-max-age'?: string;
		'access-control-request-headers'?: string;
		'access-control-request-method'?: string;
		'age'?: string;
		'allow'?: string;
		'alt-svc'?: string;
		'authorization'?: string;
		'cache-control'?: string;
		'connection'?: string;
		'content-disposition'?: string;
		'content-encoding'?: string;
		'content-language'?: string;
		'content-length'?: string;
		'content-location'?: string;
		'content-range'?: string;
		'content-type'?: string;
		'cookie'?: string;
		'date'?: string;
		'expect'?: string;
		'expires'?: string;
		'forwarded'?: string;
		'from'?: string;
		'host'?: string;
		'if-match'?: string;
		'if-modified-since'?: string;
		'if-none-match'?: string;
		'if-unmodified-since'?: string;
		'last-modified'?: string;
		'location'?: string;
		'origin'?: string;
		'pragma'?: string;
		'proxy-authenticate'?: string;
		'proxy-authorization'?: string;
		'public-key-pins'?: string;
		'range'?: string;
		'referer'?: string;
		'retry-after'?: string;
		'set-cookie'?: string[];
		'strict-transport-security'?: string;
		'tk'?: string;
		'trailer'?: string;
		'transfer-encoding'?: string;
		'upgrade'?: string;
		'user-agent'?: string;
		'vary'?: string;
		'via'?: string;
		'warning'?: string;
		'www-authenticate'?: string;
	}
}