import {TLSSocket, ConnectionOptions} from 'tls'
import {NetConnectOpts, Socket} from 'net'

export = buildConnector
declare function buildConnector (options?: buildConnector.BuildOptions): typeof buildConnector.connector

declare namespace buildConnector {
  export type BuildOptions = ConnectionOptions | NetConnectOpts

  export interface Options {
    hostname: string
    host?: string
    protocol: string
    port: number
    servername?: string
  }

  export type Callback = (err: Error | null, socket: Socket | TLSSocket | null) => void

  export function connector (options: buildConnector.Options, callback: buildConnector.Callback): Socket | TLSSocket;
}
