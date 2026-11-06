# vscode-markdoc

The VS Code client for [`markdoc-ls`](https://github.com/markdoc-rs/markdoc-ls).
Its manifest names it **Markdoc**, publisher `JJTC`, so its extension id is
`JJTC.markdoc`. It starts the binary and gets out of the way.

Every language feature a writer sees — diagnostics, completion, hover,
navigation, the colouring of tags — is the server's, which runs the same
rules CI runs, so a change to a rule reaches the editor without the extension
being rebuilt. A client that knew anything about Markdoc would be a third
place for the rules to disagree.

The one thing the extension does itself is a question only an editor asks:
[a new document from a template](#new-document-from-template), on the New
File menu.

## Install

The extension starts the program named `markdoc-ls` from `PATH`, or the one
`markdoc.serverPath` points at if that is set. Download the binary for your
platform, `markdoc-ls-<platform>`, from
[its releases](https://github.com/markdoc-rs/markdoc-ls/releases) — empty
until 0.1.0 is published — check it against the `.sha256` beside it, and
either save it in a directory on `PATH` as `markdoc-ls` (`markdoc-ls.exe` on
Windows) or point `markdoc.serverPath` at it. If your project's own setup
installed it, point `markdoc.serverPath` at the file it installed, or put the
file's directory on `PATH` if the file is named `markdoc-ls`. To build it
instead, from a `markdoc-ls` checkout:

```
cargo install --path .
```

`markdoc-ls` depends on `markdoc` and `markdoc-lint` by path, so both have to
be checked out beside it. If the binary cannot be started, the extension
shows an error naming the command it tried, and the template command still
works.

The extension itself, from a release:

```
code --install-extension markdoc-<version>.vsix
```

or built from this checkout, below.

## What reaches VS Code

| From `markdoc-ls` | In VS Code |
|---|---|
| Diagnostics, published on open and on every change. On save, and when a watched file changes on disk, the index is rebuilt and every open file re-checked. | Problems panel and squiggles |
| Completion of tag names, variables, partial paths and anchor ids; `{`, `%`, `$`, `"` and `/` trigger it | as you type |
| Hover | on |
| Go to definition: from `{% partial file="…" %}` to the file, from a reference to the line of the `{% tag %}` that declares its anchor, usually a heading | Go to Definition |
| Find references, for partials only: from `{% partial file="…" %}`, or from anywhere inside the partial, to the `{% partial %}` tags that include it | Find All References |
| Document symbols: headings and anchors | Outline, breadcrumbs, Go to Symbol |
| Semantic tokens: the colouring of tags | when the colour theme enables semantic highlighting — [see below](#highlighting) |
| Folding of matched `{% tag %}` … `{% /tag %}` pairs | on |
| Linked editing: typing in a paired tag's name edits its partner's too | only with `"editor.linkedEditing": true`; VS Code's default is `false` |
| Formatting of the inside of `{% %}` tags, and nothing else | Format Document, Format Selection |

If another extension formats Markdown too, choose this one:
`"[markdown]": { "editor.defaultFormatter": "JJTC.markdoc" }`.

## Settings

| | |
|---|---|
| `markdoc.serverPath` | The binary to start; `markdoc-ls` by default, found on `PATH`. Read when the server starts, so run `Markdoc: Restart language server` after changing it. |
| `markdoc.trace.server` | `off` / `messages` / `verbose`: the LSP conversation, logged to the **Markdoc** output channel. The server's own log (its stderr) goes to the same channel whatever this is set to. |
| `markdoc.templateDirectory` | The folder of `.md` templates offered by *New document from template*, relative to the first workspace folder; `.tooling/templates` by default. |

## Commands

- **Markdoc: Restart language server** — for when the binary is rebuilt or
  replaced underneath a running editor.
- **Markdoc: New document from template…** — below. Also offered on
  **File › New File…**.

## New document from template

The New File menu is a VS Code construct, and there is no LSP request for
it, so this is the one feature that lives in the client. It is not a second
place that knows what a Markdoc document means: a template is an ordinary
document in the corpus, and the command copies it.

1. It lists the `.md` files in `markdoc.templateDirectory`. If the folder is
   missing or holds none, it offers to create it with a starter
   `article.md`, whose frontmatter has an article's usual fields (id, type, title,
   status, version, language and dates).
2. It asks for a file name, which must end in `.md` and name no directory.
3. It creates the file next to the file in the active editor, or at the
   root of the first workspace folder when that is not a file on disk, and
   refuses to overwrite one that exists.
4. It substitutes `{{TITLE}}`, `{{SLUG}}` and `{{DATE}}` — and `{{ID}}`,
   which is the slug again. The slug is the file name without `.md`,
   trimmed and lower-cased, with every run of characters other than `a`–`z`
   and `0`–`9` turned into `_`, and then any `_` left at either end dropped:
   `My Page.md` gives `my_page`, and `(Draft) Notes.md` gives `draft_notes`.
   The title is the slug with spaces for underscores and its first letter
   capitalised. The date is today's, `YYYY-MM-DD`.

## Highlighting

There is no TextMate grammar here and no separate Markdoc language id — the
extension serves VS Code's own `markdown` language, because inventing a
language would cost every writer their Markdown tooling. VS Code's Markdown
grammar has no rule for `{% %}`. What colours a tag is the server's semantic
tokens, computed by the parser that produces the diagnostics, so a tag that
parser does not recognise is not coloured.

The token types are standard ones — `operator` for `{%`, `%}`, `/%}` and `=`,
`keyword` for control tags such as `if`, `else` and `partial`, `function` for
every other tag name, `property` for attribute names, `string` for quoted
values, `number` for numbers and booleans, `variable` for `$variables` — so a
colour theme colours them with nothing to configure, provided it enables
semantic highlighting. `editor.semanticHighlighting.enabled` defaults to
`configuredByTheme`, and the themes that ship with VS Code enable it. Under a
theme that does not:

```json
{ "[markdown]": { "editor.semanticHighlighting.enabled": true } }
```

## Scope

The extension activates on Markdown, or when its template command runs. It
serves Markdown documents that are files on disk; an Untitled buffer gets
nothing until it is saved.

It sets no `synchronize.fileEvents`. After `initialize`, once it knows the
corpus root, `markdoc-ls` registers `workspace/didChangeWatchedFiles` for
`**/markdoc-lint.toml`, `**/*.json` and `**/*.md` itself, so a config that
changes outside the editor — a pulled branch, a switched worktree — rebuilds
the index. That list used to live in this client, and Zed's client had no
equivalent: after such a change Zed went on checking every `{% $variable %}`
against a list that no longer existed. Registered by the server, it is the
same in both editors, and it lives next to the code that rebuilds the index.

## Building

```
npm ci
npm run compile
npx @vscode/vsce@3.2.1 package        # writes markdoc-<version>.vsix
node .github/scripts/check_vsix.js markdoc-<version>.vsix
```

There is no `vscode:prepublish` script, so compile before packaging: vsce
packages whatever is in `out/`. The last line checks the package holds
everything the extension loads at runtime — `main`, the other compiled
modules, and every production package in `package-lock.json`. CI runs the
same steps on Linux, macOS and Windows hosts (`.github/workflows/ci.yml`).

## Releases

Pushing a tag such as `0.2.0` publishes `markdoc-<version>.vsix` and
`SHA256SUMS` to a GitHub release, provided the tag equals the version in
`package.json` and the package passes the check above. The .vsix carries a
build-provenance attestation:

```
gh attestation verify markdoc-<version>.vsix --repo markdoc-rs/vscode-markdoc
```

Nothing is published to the VS Code Marketplace or Open VSX.

## Why TypeScript, when the rest is Rust

Because it has to be. VS Code's extension host is Node, an extension's entry
point is a JavaScript module exporting `activate`, and the `vscode` API is
reachable only from inside that host. Rust compiled to WebAssembly can do
work *behind* such an extension — that is what `@vscode/wasm-wasi` and the
component-model tooling are for — but it cannot *be* one: there is still a
TypeScript module on top handling activation. For a client whose whole job
is "find a binary and speak stdio to it", that trade is backwards: a wasm
build, bindings and a JavaScript bridge, to replace TypeScript that does
nothing interesting. Zed is the other way round: its extension API is
designed for `wasm32-wasip2` Rust cdylibs, so
[`zed-markdoc`](https://github.com/markdoc-rs/zed-markdoc) is Rust.

## License

MIT.
