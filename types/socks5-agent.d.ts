import Dispatcher from './dispatcher'
import buildConnector from './connector'
import { IncomingHttpHeaders } from './header'
import Pool from './pool'

export default Socks5Agent

declare class Socks5Agent extends Dispatcher {
  constructor (proxyUrl: string | URL, options?: Socks5Agent.Options)
}

declare namespace Socks5Agent {
  export interface Options extends Pool.Options {
    /** Additional headers to send with the proxy connection */
    headers?: IncomingHttpHeaders;
    /** SOCKS5 proxy username for authentication */
    username?: string;
    /** SOCKS5 proxy password for authentication */
    password?: string;
    /** Custom connector function for proxy connection */
    connect?: buildConnector.connector;
    /** TLS options for the proxy connection (for SOCKS5 over TLS) */
    proxyTls?: buildConnector.BuildOptions;
  }

  /** SOCKS5 authentication methods */
  export const AUTH_METHODS: {
    readonly NO_AUTH: 0x00;
    readonly GSSAPI: 0x01;
    readonly USERNAME_PASSWORD: 0x02;
    readonly NO_ACCEPTABLE: 0xFF;
  }

  /** SOCKS5 commands */
  export const COMMANDS: {
    readonly CONNECT: 0x01;
    readonly BIND: 0x02;
    readonly UDP_ASSOCIATE: 0x03;
  }

  /** SOCKS5 address types */
  export const ADDRESS_TYPES: {
    readonly IPV4: 0x01;
    readonly DOMAIN: 0x03;
    readonly IPV6: 0x04;
  }

  /** SOCKS5 reply codes */
  export const REPLY_CODES: {
    readonly SUCCEEDED: 0x00;
    readonly GENERAL_FAILURE: 0x01;
    readonly CONNECTION_NOT_ALLOWED: 0x02;
    readonly NETWORK_UNREACHABLE: 0x03;
    readonly HOST_UNREACHABLE: 0x04;
    readonly CONNECTION_REFUSED: 0x05;
    readonly TTL_EXPIRED: 0x06;
    readonly COMMAND_NOT_SUPPORTED: 0x07;
    readonly ADDRESS_TYPE_NOT_SUPPORTED: 0x08;
  }

  /** SOCKS5 client states */
  export const STATES: {
    readonly INITIAL: 'initial';
    readonly HANDSHAKING: 'handshaking';
    readonly AUTHENTICATING: 'authenticating';
    readonly CONNECTING: 'connecting';
    readonly CONNECTED: 'connected';
    readonly ERROR: 'error';
    readonly CLOSED: 'closed';
  }
}

export interface Socks5Client {
  readonly state: keyof typeof Socks5Agent.STATES;
  readonly socket: import('net').Socket;
  readonly options: Socks5Agent.Options;

  handshake(): Promise<void>;
  connect(address: string, port: number): Promise<void>;
  destroy(): void;

  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'authenticated', listener: () => void): this;
  on(event: 'connected', listener: (info: { address: string; port: number }) => void): this;

  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'close', listener: () => void): this;
  once(event: 'authenticated', listener: () => void): this;
  once(event: 'connected', listener: (info: { address: string; port: number }) => void): this;

  removeListener(event: 'error', listener: (err: Error) => void): this;
  removeListener(event: 'close', listener: () => void): this;
  removeListener(event: 'authenticated', listener: () => void): this;
  removeListener(event: 'connected', listener: (info: { address: string; port: number }) => void): this;
}

export interface Socks5ClientConstructor {
  new(socket: import('net').Socket, options?: Socks5Agent.Options): Socks5Client;
}

export const Socks5Client: Socks5ClientConstructor
