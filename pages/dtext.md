# DText

DText is e621's text formatting language, a mix of Textile, BBCode, MediaWiki, and Markdown. It's used in comments, forum posts, wiki pages, DMails, blips, pool and post descriptions, notes, tickets, and user profiles. This is adapted from e621's [DText help page](https://e621.net/wiki_pages/e621:dtext).

- [In the API](#in-the-api)
- [Basic Formatting](#basic-formatting)
- [Links](#links)
- [Blocks](#blocks)
- [Escaping](#escaping)

## In the API

- Fields like `body` and `description` are returned as raw DText, not HTML.
- To render DText, use [`POST /dtext_preview.json`](/#/DText). It returns the HTML, and the data needed to show any `thumb #123` post thumbnails.
- Each field has a maximum length:

| Field | Max length |
|---|---|
| Wiki pages, artist notes | 250,000 |
| Forum posts, DMails, post descriptions, user profiles | 50,000 |
| User feedback | 20,000 |
| Comments, pool descriptions | 10,000 |
| Tickets | 5,000 |
| Blips, notes | 1,000 |

## Basic Formatting

| DText | Result |
|---|---|
| `[b]Bold[/b]` | **Bold** |
| `[i]Italics[/i]` | *Italics* |
| `[s]Strikeout[/s]` | ~~Strikeout~~ |
| `[u]Underline[/u]` | Underlined text |
| `[sup]Superscript[/sup]` / `[sub]Subscript[/sub]` | Superscript / subscript |
| `[spoiler]Spoiler[/spoiler]` | Hidden until clicked |
| `` `inline code` `` | `inline code` |
| `[color=red]Red[/color]` | Colored text. Takes color names, tag categories (ex: `artist`), or hex codes. Privileged+ only. |

## Links

| DText | Result |
|---|---|
| `https://example.com` | Plain URLs are linked automatically |
| `<https://example.com/link_(test)>` | A URL including characters like `)` at the end |
| `"A link":https://example.com` | A link with a custom title |
| `"A link":[https://example.com/link_(test)]` | A link with a title, and brackets around the URL |
| `"A link":/users` | A link within e621 |
| `[[simple background]]` | A link to a wiki page |
| `[[simple background\|Some text]]` | A wiki link with a custom title |
| `[[mammal#equine]]` | A link to an anchor on a wiki page |
| `[[#anchor]]` | A link to an anchor on the current page |
| `{{mammal -cat}}` | A link to a post search |
| `post #1234` | A link to a post. Also works with `post changes`, `topic`, `forum`, `comment`, `blip`, `pool`, `set`, `takedown`, `record`, and `ticket`. |
| `thumb #1234` | A post thumbnail |

## Blocks

| DText | Result |
|---|---|
| `[quote]Text[/quote]` | A quote. Takes a color like `[color]`, ex: `[quote=red]`. |
| `[code]Text[/code]` | A code block |
| `h1. Header` | A header, from `h1.` to `h6.` |
| `* Item` | A list item. Use `**` for nested items. |
| `[section]Text[/section]` | A collapsed section. Use `[section=Title]` for a title, and `[section,expanded=Title]` to expand it by default. |
| `[#anchor]` | An anchor to link to. Letters, numbers, and underscores only. |

Tables can be written like HTML:

```
[table]
  [thead]
    [tr][th]Header[/th][th]Header[/th][/tr]
  [/thead]
  [tbody]
    [tr][td]Cell[/td][td]Cell[/td][/tr]
  [/tbody]
[/table]
```

Or with `ltable`, which separates cells with `|`, so cells can't contain one:

```
[ltable]
Header A | Header B
Cell A1  | Cell B1
[/ltable]
```

## Escaping

Text in backticks or `[code]` blocks isn't parsed. To write a literal backtick, escape it with a backslash: `` \` ``.
