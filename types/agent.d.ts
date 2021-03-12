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
  opts?: { agent?: Agent, maxRedirects?: boolean | number } & Omit<Partial<Client.RequestOptions>, 'path'>,
): PromiseLike<Client.ResponseData>;

declare function stream(
  url: string | URL | UrlObject,
  opts: { agent?: Agent, maxRedirects?: boolean | number } & Omit<Partial<Client.RequestOptions>, 'path'>,
  factory: Client.StreamFactory
): PromiseLike<Client.StreamData>;

declare function pipeline(
  url: string | URL | UrlObject,
  opts: { agent?: Agent, maxRedirects?: boolean | number } & Omit<Partial<Client.PipelineOptions>, 'path'>,
  handler: Client.PipelineHandler
): Duplex;
