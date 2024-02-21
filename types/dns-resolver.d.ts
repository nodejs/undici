import { lookup, promises, LookupAddress, LookupOneOptions, LookupAllOptions, LookupOptions } from 'node:dns'


export default DNSResolver

declare class DNSResolver {
  constructor(opts?: DNSResolver.Options)
    lookup(
        hostname: string,
        family: number,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number, ttl: number, expires: number) => void,
    ): void;
    lookup(
        hostname: string,
        options: LookupOneOptions,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number, ttl: number, expires: number) => void,
    ): void;
    lookup(
        hostname: string,
        options: LookupAllOptions,
        callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
    ): void;
    lookup(
        hostname: string,
        options: LookupOptions,
        callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family: number) => void,
    ): void;
    lookup(
        hostname: string,
        callback: (err: NodeJS.ErrnoException | null, address: string, family: number, ttl: number, expires: number) => void,
    ): void;
    servers: string[]
    lookupAsync: (hostname: string, options: LookupOptions | number) => Promise<DNSResolver.LookupAddress | DNSResolver.LookupAddress[]>
    queryAndCache: (hostname: string) => Promise<DNSResolver.LookupAddress[]>;
    query: (hostname: string) => Promise<DNSResolver.LookupAddress[]>;
    updateInterfaceInfo: () => void;
    clear: (hostname?: string) => void;
}

interface CacheInterface {
  set: (key:string, value: LookupAddress[]) => Promise<void>;
  get: (key: string) => Promise<undefined | LookupAddress[]>;
  delete: (key?: string) => void;
  clear: () => void;
}

declare namespace DNSResolver {
  export interface LookupAddress {
    address: string;
    family: 4 | 6;
    ttl: number;
    expires: number;
  }

  export interface Options {
    lookupOptions?: {
      family?: 4 | 6 | 0;
      hints?: number;
      all?: boolean;
    };
    maxTtl?: number;
    cache?: Map<string, LookupAddress[]> | CacheInterface;
    fallbackDuration?: number;
    errorTtl?: number;
    resolver?: typeof promises.Resolver;
    lookup?: typeof lookup;
    scheduling?: 'first' | 'random';
  }
}
