import { expectAssignable } from 'tsd'
import BodyReadable from '../../types/readable'
import { Blob } from 'buffer'

expectAssignable<BodyReadable>(new BodyReadable({
  abort: () => null,
  resume: () => null
}))

{
  const readable = new BodyReadable({
    abort: () => null,
    resume: () => null
  })

  // dump
  expectAssignable<Promise<void>>(readable.dump())
  expectAssignable<Promise<void>>(readable.dump({ limit: 123 }))

  // text
  expectAssignable<Promise<string>>(readable.text())

  // json
  expectAssignable<Promise<unknown>>(readable.json())

  // blob
  expectAssignable<Promise<Blob>>(readable.blob())

  // bytes
  expectAssignable<Promise<Uint8Array>>(readable.bytes())

  // arrayBuffer
  expectAssignable<Promise<ArrayBuffer>>(readable.arrayBuffer())

  // formData
  expectAssignable<Promise<never>>(readable.formData())

  // bodyUsed
  expectAssignable<boolean>(readable.bodyUsed)

  // body
  expectAssignable<never | undefined>(readable.body)
}
