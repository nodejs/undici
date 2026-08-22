import { TLSSocket, ConnectionOptions } from 'node:tls'
import { IpcNetConnectOpts, Socket, TcpNetConnectOpts } from 'node:net'

export default buildConnector
declare function buildConnector (options?: buildConnector.BuildOptions): buildConnector.connector

declare namespace buildConnector {
  export type BuildOptions = (ConnectionOptions | TcpNetConnectOpts | IpcNetConnectOpts) & {
    allowH2?: boolean | undefined;
    preferH2?: boolean | undefined;
    maxCachedSessions?: number | null | undefined;
    socketPath?: string | null | undefined;
    timeout?: number | null | undefined;
    port?: number | undefined;
    keepAlive?: boolean | null | undefined;
    keepAliveInitialDelay?: number | null | undefined;
    typeOfService?: number | null | undefined;
  }

  export interface Options {
    hostname: string
    host?: string | undefined
    protocol: string
    port: string
    servername?: string | undefined
    localAddress?: string | null | undefined
    socketPath?: string | null | undefined
    httpSocket?: Socket | undefined
  }

  export type Callback = (...args: CallbackArgs) => void
  type CallbackArgs = [null, Socket | TLSSocket] | [Error, null]

  export interface connector {
    (options: buildConnector.Options, callback: buildConnector.Callback): void
  }
}
