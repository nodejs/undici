import { Socket } from 'node:net'
import { expectAssignable } from 'tsd'
import { DiagnosticsChannel, WebSocket, buildConnector } from '../..'

const request = {
  origin: '',
  completed: true,
  method: 'GET' as const,
  path: '',
  headers: '',
  addHeader: (key: string, value: string) => {
    return request
  }
}

const response = {
  statusCode: 200,
  statusText: 'OK',
  headers: [Buffer.from(''), Buffer.from('')]
}

const connectParams = {
  host: '',
  hostname: '',
  protocol: '',
  port: '',
  servername: ''
}

const websocket = {} as InstanceType<typeof WebSocket>

expectAssignable<DiagnosticsChannel.RequestCreateMessage>({ request })
expectAssignable<DiagnosticsChannel.RequestBodyChunkSentMessage>({ request, chunk: Buffer.from('') })
expectAssignable<DiagnosticsChannel.RequestBodyChunkSentMessage>({ request, chunk: '' })
expectAssignable<DiagnosticsChannel.RequestBodySentMessage>({ request })
expectAssignable<DiagnosticsChannel.RequestHeadersMessage>({
  request,
  response
})
expectAssignable<DiagnosticsChannel.RequestBodyChunkReceivedMessage>({ request, chunk: Buffer.from('') })
expectAssignable<DiagnosticsChannel.RequestTrailersMessage>({
  request,
  trailers: [Buffer.from(''), Buffer.from('')]
})
expectAssignable<DiagnosticsChannel.RequestErrorMessage>({
  request,
  error: new Error('Error')
})
expectAssignable<DiagnosticsChannel.ClientSendHeadersMessage>({
  request,
  headers: '',
  socket: new Socket()
})
expectAssignable<DiagnosticsChannel.ClientBeforeConnectMessage>({
  connectParams,
  connector: (
    options: buildConnector.Options,
    callback: buildConnector.Callback
  ) => new Socket()
})
expectAssignable<DiagnosticsChannel.ClientConnectedMessage>({
  socket: new Socket(),
  connectParams,
  connector: (
    options: buildConnector.Options,
    callback: buildConnector.Callback
  ) => new Socket()
})
expectAssignable<DiagnosticsChannel.ClientConnectErrorMessage>({
  error: new Error('Error'),
  socket: new Socket(),
  connectParams,
  connector: (
    options: buildConnector.Options,
    callback: buildConnector.Callback
  ) => new Socket()
})
expectAssignable<DiagnosticsChannel.WebsocketCreatedMessage>({
  websocket,
  url: 'ws://localhost:3000'
})
expectAssignable<DiagnosticsChannel.WebsocketHandshakeRequestMessage>({
  websocket,
  request: {
    headers: {}
  }
})
expectAssignable<DiagnosticsChannel.WebsocketOpenMessage>({
  address: {
    address: '127.0.0.1',
    family: 'IPv4',
    port: 3000
  },
  protocol: '',
  extensions: '',
  websocket,
  handshakeResponse: {
    status: 101,
    statusText: 'Switching Protocols',
    headers: {}
  }
})
expectAssignable<DiagnosticsChannel.WebsocketCloseMessage>({
  websocket,
  code: 1000,
  reason: ''
})
expectAssignable<DiagnosticsChannel.WebsocketFrameMessage>({
  websocket,
  opcode: 1,
  mask: true,
  payloadData: Buffer.from('')
})
expectAssignable<DiagnosticsChannel.WebsocketFrameErrorMessage>({
  websocket,
  error: new Error('Error')
})
expectAssignable<DiagnosticsChannel.WebsocketSocketErrorMessage>({
  websocket,
  error: new Error('Error')
})
