import { URL, UrlObject } from 'url'
import Dispatcher from './dispatcher'

/** Performs an HTTP request. */
declare function request<TOpaque = null> (
  url: string | URL | UrlObject,
  options?: { dispatcher?: Dispatcher } & Omit<Dispatcher.RequestOptions<TOpaque>, 'origin' | 'path' | 'method'> & Partial<Pick<Dispatcher.RequestOptions, 'method'>>,
): Promise<Dispatcher.ResponseData<TOpaque>>

export {
  request
}
