import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Dispatcher, request, stream, pipeline, connect, upgrade } from '../..'

// request
expectAssignable<PromiseLike<Dispatcher.ResponseData>>(request(''))
expectAssignable<PromiseLike<Dispatcher.ResponseData>>(request('', { method: '' }))

// stream
expectAssignable<PromiseLike<Dispatcher.StreamData>>(stream('', { method: '' }, data => {
  expectAssignable<Dispatcher.StreamFactoryData>(data)
  return new Writable()
}))

// pipeline
expectAssignable<Duplex>(pipeline('', { method: '' }, data => {
  expectAssignable<Dispatcher.PipelineHandlerData>(data)
  return new Readable()
}))

// connect
expectAssignable<PromiseLike<Dispatcher.ConnectData>>(connect(''))
expectAssignable<PromiseLike<Dispatcher.ConnectData>>(connect('', {}))

// upgrade
expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(upgrade(''))
expectAssignable<PromiseLike<Dispatcher.UpgradeData>>(upgrade('', {}))
