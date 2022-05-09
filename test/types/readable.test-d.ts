import { expectAssignable } from 'tsd'
import BodyReadable = require('../../types/readable')
import { Blob } from 'buffer'

expectAssignable<BodyReadable>(new BodyReadable())

{
  const readable = new BodyReadable()

  // dump
  expectAssignable<Promise<void>>(readable.dump())
  expectAssignable<Promise<void>>(readable.dump({ limit: 123 }))

  // text
  expectAssignable<Promise<string>>(readable.text())

  // json
  expectAssignable<Promise<any>>(readable.json())

  // blob
  expectAssignable<Promise<Blob>>(readable.blob())

  // arrayBuffer
  expectAssignable<Promise<ArrayBuffer>>(readable.arrayBuffer())

  // formData
  expectAssignable<Promise<never>>(readable.formData())

  // bodyUsed
  expectAssignable<boolean>(readable.bodyUsed)

  // body
  expectAssignable<never | undefined>(readable.body)
}
