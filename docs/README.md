# Documentation source

This directory holds the source for undici's documentation site. The Markdown
files here are built by [doc-kit][] (the same tooling Node.js core uses) into the
published site.

Most of the directory is plain Markdown (`index.md`, `getting-started.md`,
`api/*.md`, `best-practices/*.md`). Two JSON files control how that Markdown is
turned into a navigable, cross-linked site:

- [`site.json`](./docs/site.json) — the sidebar / navigation structure.
- [`type-map.json`](./docs/type-map.json) — resolves `{Type}` annotations into links.

## `site.json`

`site.json` defines the documentation sidebar. doc-kit reads it to render the
left-hand navigation; pages are **not** auto-discovered, so a Markdown file only
appears in the sidebar once it is listed here.

The file has a single top-level `sidebar` array. Each entry is a group:

```json
{
  "sidebar": [
    {
      "groupName": "Documentation",
      "items": [
        { "link": "/", "label": "Home" },
        { "link": "/getting-started", "label": "Getting Started" }
      ]
    }
  ]
}
```

### Fields

- `groupName` — the heading shown above a top-level section of the sidebar.
- `items` — the entries within a group. An item is one of:
  - **A link**: `{ "link": "/api/Client", "label": "Client" }`
    - `link` — a site-relative path. It maps to the Markdown file of the same
      name without the `.md` extension. `/` is `index.md`,
      `/getting-started` is `getting-started.md`, and `/api/Client` is
      `api/Client.md`.
    - `label` — the text displayed in the sidebar.
  - **A nested group**: `{ "label": "Core", "items": [ ... ] }`
    - `label` — the collapsible sub-heading.
    - `items` — a further list of links (or groups). This is how the `API`
      group is split into `Core`, `Proxy & Agents`, `Web Standards`, and so on.

### Adding a page to the sidebar

1. Create the Markdown file (for example `api/MyFeature.md`).
2. Add an item under the appropriate group in `site.json`:
   ```json
   { "link": "/api/MyFeature", "label": "My Feature" }
   ```

Order within a group is significant — items appear in the sidebar in the order
they are listed.

## `type-map.json`

Throughout the API docs, types are written in curly braces — for example
`{Dispatcher}`, `{AgentOptions}`, or `{Buffer}`:

```markdown
* `options` {AgentOptions} (optional) Extends {PoolOptions}.
  * Returns: {Dispatcher}
```

This is the Node.js documentation convention for annotating the type of a
parameter, option, or return value. `type-map.json` tells doc-kit what each of
those type names should link to, so `{Dispatcher}` in any page becomes a link to
the `Dispatcher` documentation.

The file is a flat object mapping a **type name** to a **URL**:

```json
{
  "Agent": "/api/Agent.md#class-agent",
  "AgentOptions": "/api/Agent.md#new-agentoptions",
  "Buffer": "https://nodejs.org/api/buffer.html#class-buffer"
}
```

### Link targets

Targets are either internal or external:

- **Internal** — a site-relative path into our own docs, usually with an anchor
  pointing at a specific heading: `/api/Agent.md#class-agent`. The anchor is the
  GitHub-style slug of the heading text (lowercased, spaces and punctuation
  replaced with hyphens). For example the heading `### new Agent([options])`
  becomes the anchor `#new-agentoptions`.
- **External** — a full URL to upstream documentation for types we don't define
  ourselves, such as Node.js built-ins ([`Buffer`][], [`Readable`][]) or web
  platform types on MDN (`HeadersInit`, `Iterable`).

### Adding or updating a type

When you document a new type, or reference an existing one in `{...}` form, add
an entry so the annotation resolves to a link:

1. Pick the type name exactly as it appears between the braces in the Markdown
   (the key is matched verbatim — `MockInterceptor.Options` and `net.Socket`
   are valid keys).
2. Add `"TypeName": "<target>"` to `type-map.json`, pointing at the heading that
   documents it (internal) or its upstream reference (external).

If a `{Type}` annotation has no matching key, it renders as plain text instead
of a link, so keep this file in sync when headings are renamed or pages move.

[doc-kit]: https://github.com/nodejs/doc-kit
