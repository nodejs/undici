import { UrlObject } from 'url'
import Pool from './pool'
import Client from './client'
import { Duplex } from 'stream'
import { URL } from 'url'

export {
  Agent,
  setGlobalAgent,
  request,
  stream,
  pipeline,
}

declare class Agent {
  constructor(opts?: Pool.Options)
  get(origin: string): Pool;
}

declare function setGlobalAgent<AgentImplementation extends Agent>(agent: AgentImplementation): void;

declare function request(
  url: string | URL | UrlObject,
  opts?: { agent?: Agent } & Client.RequestOptions,
): PromiseLike<Client.ResponseData>;

declare function stream(
  url: string | URL | UrlObject,
  opts: { agent?: Agent } & Client.RequestOptions,
  factory: Client.StreamFactory
): PromiseLike<Client.StreamData>;

declare function pipeline(
  url: string | URL | UrlObject,
  opts: { agent?: Agent } & Client.PipelineOptions,
  handler: Client.PipelineHandler
): Duplex;