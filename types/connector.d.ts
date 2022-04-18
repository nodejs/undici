import { URL } from 'url'
import { TLSSocket, TlsOptions } from 'tls'
import { Socket } from 'net'

export = buildConnector
declare function buildConnector (options?: buildConnector.BuildOptions): buildConnector.connector

declare namespace buildConnector {
  export interface BuildOptions extends TlsOptions {
    maxCachedSessions?: number | null;
    socketPath?: string | null;
    timeout?: number | null;
    servername?: string | null;
  }

  export interface Options {
    hostname: string
    host?: string
    protocol: string
    port: number
    servername?: string
  }

  export type Callback = (...args: CallbackArgs) => void
  type CallbackArgs = [null, Socket | TLSSocket] | [Error, null]

  export type connector = connectorAsync | connectorSync

  interface connectorSync {
    (options: buildConnector.Options): Socket | TLSSocket
  }

  interface connectorAsync {
    (options: buildConnector.Options, callback: buildConnector.Callback): void
  }
}
