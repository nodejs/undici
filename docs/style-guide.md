# Documentation Style Guide

The docs in this repo are enforced by this style guide. The purpose of this guide is to make sure the documentation is easily readable by all levels of developers. Derived from the Electron project [documentation](https://github.com/electron/electron/tree/master/docs) process.

## Rules

- A `<Documentation Page>` is a markdown document containing one or many hierarchical `<Class Definition Block>` for the top-level objects exported by Undici.
- A `<Class Definition Block>` should describe the object as it would be consumed by an user. It should **not** describe internal properties or methods.
- A `<Class Definition Block>` should start with a `<Class Title Line>`
- A `<Class Title Line>` should follow the syntax `# Class: <Class Name>`
- A `<Class Name>` is any valid JavaScript class name
- A `<Class Definition Block>` can contain an optional `<Extends Line>` immediately following the `<Class Title Line>`
- An `<Extends Line>` should follow the syntax `Extends: <Extendable Object>`
- An `<Extendable Object>` is any extendable JavaScript object
- A `<Class Definition Block>` should have a `<Class Description Block>` immediately following the `<Class Title Line>` or the `<Extends Line>` if it exists
- A `<Class Definition Block>` should have a `<Class Constructor Definition Block>` immediately following the `<Class Description Block>`
- A `<Class Constructor Definition Block>` should follow the syntax ``## `new <Class Name>(<Argument List>)` ``
