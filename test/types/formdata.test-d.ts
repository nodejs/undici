import { Blob } from 'buffer'
import { Readable } from 'stream'
import { expectAssignable, expectType } from 'tsd'
import { File, FormData, SpecIterableIterator } from '../..'
import { DispatchOptions } from '../../types/dispatcher'

declare const dispatcherOptions: DispatchOptions

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
