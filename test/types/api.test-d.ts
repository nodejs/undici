import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable, expectType } from 'tsd'
import { Dispatcher, request, stream, pipeline, connect, upgrade } from '../..'

// request
expectAssignable<Promise<Dispatcher.ResponseData>>(request(''))
expectAssignable<Promise<Dispatcher.ResponseData>>(request('', { }))
expectAssignable<Promise<Dispatcher.ResponseData>>(request('', { method: 'GET', reset: false }))

// stream
expectAssignable<Promise<Dispatcher.StreamData>>(stream('', { method: 'GET' }, data => {
  expectAssignable<Dispatcher.StreamFactoryData>(data)
  expectType<null>(data.opaque)
  return new Writable()
}))
expectAssignable<Promise<Dispatcher.StreamData<{ example: string }>>>(stream('', { method: 'GET', opaque: { example: '' } }, data => {
  expectType<{ example: string }>(data.opaque)
  return new Writable()
}))

// pipeline
expectAssignable<Duplex>(pipeline('', { method: 'GET' }, data => {
  expectAssignable<Dispatcher.PipelineHandlerData>(data)
  expectType<null>(data.opaque)
  return new Readable()
}))
expectAssignable<Duplex>(pipeline('', { method: 'GET', opaque: { example: '' } }, data => {
  expectType<{ example: string }>(data.opaque)
  return new Readable()
}))

// connect
expectAssignable<Promise<Dispatcher.ConnectData>>(connect(''))
expectAssignable<Promise<Dispatcher.ConnectData>>(connect('', {}))

// upgrade
expectAssignable<Promise<Dispatcher.UpgradeData>>(upgrade(''))
expectAssignable<Promise<Dispatcher.UpgradeData>>(upgrade('', {}))
