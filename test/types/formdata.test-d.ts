import { Blob, File } from 'node:buffer'
import { Readable } from 'node:stream'
import { expectAssignable, expectType } from 'tsd'
import { FormData, SpecIterableIterator } from '../..'
import Dispatcher from '../../types/dispatcher'

declare const dispatcherOptions: Dispatcher.DispatchOptions

declare const blob: Blob
const formData = new FormData()
expectType<FormData>(formData)

expectType<void>(formData.append('key', 'value'))
expectType<void>(formData.append('key', blob))
expectType<void>(formData.set('key', 'value'))
expectType<void>(formData.set('key', blob))
expectType<File | string | null>(formData.get('key'))
expectType<File | string | null>(formData.get('key'))
expectType<Array<File | string>>(formData.getAll('key'))
expectType<Array<File | string>>(formData.getAll('key'))
expectType<boolean>(formData.has('key'))
expectType<void>(formData.delete('key'))
expectAssignable<SpecIterableIterator<string>>(formData.keys())
expectAssignable<SpecIterableIterator<File | string>>(formData.values())
expectAssignable<SpecIterableIterator<[string, File | string]>>(formData.entries())
expectAssignable<SpecIterableIterator<[string, File | string]>>(formData[Symbol.iterator]())
expectAssignable<string | Buffer | Uint8Array | FormData | Readable | undefined | null>(dispatcherOptions.body)

const extendedFormData = new (class extends FormData {
  override forEach (...args: Parameters<FormData['forEach']>) {
    return super.forEach(...args)
  }

  override keys () {
    return super.keys()
  }

  override values () {
    return super.values()
  }

  override entries () {
    return super.entries()
  }

  override [Symbol.iterator] () {
    return super[Symbol.iterator]()
  }
})()

expectType<void>(extendedFormData.forEach((value, key, iterable) => {
  expectType<File | string>(value)
  expectType<string>(key)
  expectType<FormData>(iterable)
}))
expectType<SpecIterableIterator<string>>(extendedFormData.keys())
expectType<SpecIterableIterator<File | string>>(extendedFormData.values())
expectType<SpecIterableIterator<[string, File | string]>>(extendedFormData.entries())
expectType<SpecIterableIterator<[string, File | string]>>(extendedFormData[Symbol.iterator]())

const formDataWithArrowEntries = new (class extends FormData {
  override entries = () => super.entries()
})()

expectType<SpecIterableIterator<[string, File | string]>>(formDataWithArrowEntries.entries())
