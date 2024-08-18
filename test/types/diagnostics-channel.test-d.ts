import { Socket } from 'net'
import { expectAssignable } from 'tsd'
import { DiagnosticsChannel, buildConnector } from '../..'

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

expectAssignable<DiagnosticsChannel.RequestCreateMessage>({ request })
expectAssignable<DiagnosticsChannel.RequestBodySentMessage>({ request })
expectAssignable<DiagnosticsChannel.RequestHeadersMessage>({
  request,
  response
})
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
