import Pool from './types/pool'
import Client from './types/client'
import errors from './types/errors'
import { Agent, setGlobalAgent, request, stream, pipeline } from './types/agent'

export { Pool, Client, errors, Agent, setGlobalAgent, request, stream, pipeline }
export default Undici

declare function Undici(url: string, opts: Pool.Options): Pool

declare namespace Undici {
  var Pool: typeof import('./types/pool');
  var Client: typeof import('./types/client');
  var errors: typeof import('./types/errors');
  var Agent: typeof import('./types/agent').Agent;
  var setGlobalAgent: typeof import('./types/agent').setGlobalAgent;
  var request: typeof import('./types/agent').request;
  var stream: typeof import('./types/agent').stream;
  var pipeline: typeof import('./types/agent').pipeline;
}
