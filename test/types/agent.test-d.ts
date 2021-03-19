import { expectAssignable } from 'tsd'
import { Pool, Agent, setGlobalAgent, request, stream, pipeline, Client, redirectPoolFactory } from '../..'
import { Writable, Readable, Duplex } from 'stream'

expectAssignable<Agent>(new Agent())
expectAssignable<Agent>(new Agent({}))

{
  const agent = new Agent()

  expectAssignable<Pool>(agent.get(''))
}

{
  expectAssignable<void>(setGlobalAgent(new Agent()))
  expectAssignable<void>(setGlobalAgent(new Agent({ factory: redirectPoolFactory })))
}

{
  expectAssignable<PromiseLike<Client.ResponseData>>(request('', { maxRedirections: 1 }))
  expectAssignable<PromiseLike<Client.StreamData>>(stream('', { method: '', maxRedirections: 1 }, data => {
    expectAssignable<Client.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Client.ResponseData>>(request(''))
}

{
  expectAssignable<Duplex>(pipeline('', { method: '', maxRedirections: 1 }, data => {
    expectAssignable<Client.PipelineHandlerData>(data)
    return new Readable()
  }))
}
