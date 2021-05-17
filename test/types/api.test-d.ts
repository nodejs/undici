import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Dispatcher, request, stream, pipeline, connect, upgrade } from '../..'

// request
expectAssignable<Promise<Dispatcher.ResponseData>>(request(''))
expectAssignable<Promise<Dispatcher.ResponseData>>(request('', { method: '' }))

// stream
expectAssignable<Promise<Dispatcher.StreamData>>(stream('', { method: '' }, data => {
  expectAssignable<Dispatcher.StreamFactoryData>(data)
  return new Writable()
}))

// pipeline
expectAssignable<Duplex>(pipeline('', { method: '' }, data => {
  expectAssignable<Dispatcher.PipelineHandlerData>(data)
  return new Readable()
}))

// connect
expectAssignable<Promise<Dispatcher.ConnectData>>(connect(''))
expectAssignable<Promise<Dispatcher.ConnectData>>(connect('', {}))

// upgrade
expectAssignable<Promise<Dispatcher.UpgradeData>>(upgrade(''))
expectAssignable<Promise<Dispatcher.UpgradeData>>(upgrade('', {}))
