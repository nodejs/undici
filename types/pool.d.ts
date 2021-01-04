import Client from './client'
import { URL } from 'url'

export = Pool

declare class Pool extends Client {
  constructor(url: string | URL, options?: Pool.Options)
}

declare namespace Pool {
  export interface Options extends Client.Options {
    /** The number of clients to create. Default `100`. */
    connections?: number
  }
}
