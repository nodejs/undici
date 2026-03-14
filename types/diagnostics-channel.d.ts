import { Socket } from 'node:net'
import { URL } from 'node:url'
import buildConnector from './connector'
import Dispatcher from './dispatcher'

declare namespace DiagnosticsChannel {
  type WebSocket = InstanceType<typeof import('./websocket').WebSocket>
  interface Request {
    origin?: string | URL;
    completed: boolean;
    method?: Dispatcher.HttpMethod;
    path: string;
    headers: any;
  }
  interface Response {
    statusCode: number;
    statusText: string;
    headers: Array<Buffer>;
  }
  interface ConnectParams {
    host: URL['host'];
    hostname: URL['hostname'];
    protocol: URL['protocol'];
    port: URL['port'];
    servername: string | null;
  }
  type Connector = buildConnector.connector
  export interface RequestCreateMessage {
    request: Request;
  }
  export interface RequestBodySentMessage {
    request: Request;
  }

  export interface RequestBodyChunkSentMessage {
    request: Request;
    chunk: Uint8Array | string;
  }
  export interface RequestBodyChunkReceivedMessage {
    request: Request;
    chunk: Buffer;
  }
  export interface RequestHeadersMessage {
    request: Request;
    response: Response;
  }
  export interface RequestTrailersMessage {
    request: Request;
    trailers: Array<Buffer>;
  }
  export interface RequestErrorMessage {
    request: Request;
    error: Error;
  }
  export interface ClientSendHeadersMessage {
    request: Request;
    headers: string;
    socket: Socket;
  }
  export interface ClientBeforeConnectMessage {
    connectParams: ConnectParams;
    connector: Connector;
  }
  export interface ClientConnectedMessage {
    socket: Socket;
    connectParams: ConnectParams;
    connector: Connector;
  }
  export interface ClientConnectErrorMessage {
    error: Error;
    socket: Socket;
    connectParams: ConnectParams;
    connector: Connector;
  }
  export interface WebsocketCreatedMessage {
    websocket: WebSocket;
    url: string;
  }
  export interface WebsocketHandshakeRequestMessage {
    websocket: WebSocket;
    request: {
      headers: Record<string, string>;
    };
  }
  export interface WebsocketOpenMessage {
    address: {
      address: string;
      family: string;
      port: number;
    };
    protocol: string;
    extensions: string;
    websocket: WebSocket;
    handshakeResponse: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
    };
  }
  export interface WebsocketCloseMessage {
    websocket: WebSocket;
    code: number;
    reason: string;
  }
  export interface WebsocketFrameMessage {
    websocket: WebSocket;
    opcode: number;
    mask: boolean;
    payloadData: Buffer;
  }
  export interface WebsocketFrameErrorMessage {
    websocket: WebSocket;
    error: Error;
  }
  export interface WebsocketSocketErrorMessage {
    websocket?: WebSocket;
    error: Error;
  }
}
