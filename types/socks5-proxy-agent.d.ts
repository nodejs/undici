import Dispatcher from './dispatcher'
import buildConnector from './connector'
import { OutgoingHttpHeaders } from './header'
import Pool from './pool'

export default Socks5ProxyAgent

declare class Socks5ProxyAgent extends Dispatcher {
  constructor (proxyUrl: string | URL, options?: Socks5ProxyAgent.Options)
}

declare namespace Socks5ProxyAgent {
  export interface Options extends Pool.Options {
    /** Additional headers to send with the proxy connection */
    headers?: OutgoingHttpHeaders | undefined;
    /** SOCKS5 proxy username for authentication */
    username?: string | undefined;
    /** SOCKS5 proxy password for authentication */
    password?: string | undefined;
    /** Custom connector function for proxy connection */
    connect?: buildConnector.connector | undefined;
    /** TLS options for the proxy connection (for SOCKS5 over TLS) */
    proxyTls?: buildConnector.BuildOptions | undefined;
  }
}
