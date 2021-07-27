import { URL } from 'url'
import { TLSSocket, TlsOptions } from 'tls'
import { Socket } from 'net'

export = Connector

declare class Connector {
  constructor (options: Connector.Options);
  /** Creates a new socket and returns it */
  connect (options: Connector.ConnectOptions, callback: Connector.connectCallback): Socket | TLSSocket;
}

declare namespace Connector {
  export interface Options extends TlsOptions {
    maxCachedSessions?: number | null;
    socketPath?: string | null;
    timeout?: number | null;
    servername?: string | null;
  }

  export interface ConnectOptions {
    hostname: string
    host?: string
    protocol: string
    port: number
    servername?: string
  }

  export type connectCallback = (err: Error | null, socket: Socket | TLSSocket | null) => void
}
