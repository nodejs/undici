/// <reference types="node" />

// https://wicg.github.io/cookie-store/#CookieStore

export interface CookieStore extends EventTarget {
  get (name: string): Promise<CookieListItem | null>;
  get (options?: CookieStoreGetOptions): Promise<CookieListItem | null>;

  getAll (name: string): Promise<CookieList>;
  getAll (options?: CookieStoreGetOptions): Promise<CookieList>;

  set (name: string, value: string): Promise<void>;
  set (options: CookieInit): Promise<void>;

  delete (name: string): Promise<void>;
  delete (options: CookieStoreDeleteOptions): Promise<void>;

  onchange (this: CookieStore, event: CookieChangeEvent): void;
}

export interface CookieStoreGetOptions {
  name: string;
  url: string;
}

export type CookieSameSite = 'strict' | 'lax' | 'none'

export interface CookieInit {
  name: string;
  value: string;
  /**
   * @default null
   */
  expires: number | null;
  /**
   * @default null
   */
  domain: string | null;
  /**
   * @default '/''
   */
  path: string;
  /**
   * @default 'strict'
   */
  sameSite: CookieSameSite;
}

export interface CookieStoreDeleteOptions {
  name: string;
  domain: string | null;
  /**
   * @default '/'
   */
  path: string;
}

export interface CookieListItem {
  name: string;
  value: string;
  domain: string | null;
  path: string;
  expires: number | null;
  secure: boolean;
  sameSite: CookieSameSite;
}

export type CookieList = CookieListItem[]

export interface CookieStoreManager {
  subscribe (subscriptions: CookieStoreGetOptions[]): Promise<void>;
  getSubscriptions (): Promise<CookieStoreGetOptions[]>;
  unsubscribe (subscriptions: CookieStoreGetOptions[]): Promise<void>;
}

export interface CookieChangeEvent extends Event {
  constructor (type: string, eventInitDict?: CookieChangeEventInit): CookieChangeEvent;
  readonly changed: readonly CookieListItem[];
  readonly deleted: readonly CookieListItem[];
}

export interface CookieChangeEventInit extends EventInit {
  changed: CookieList;
  deleted: CookieList;
}