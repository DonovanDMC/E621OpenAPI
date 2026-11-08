# Post Files

- [File URLs](#file-urls)
- [Formats](#formats)
- [Video Files](#video-files)
- [Hidden Files](#hidden-files)

## File URLs

Every post's files are named by the file's MD5, and stored in folders named after the first two pairs of characters:

| File | URL |
|---|---|
| Original | `https://static1.e621.net/data/f3/59/f3590a911a687c67c74fb4665a9635d3.webm` |
| Preview | `https://static1.e621.net/data/preview/f3/59/f3590a911a687c67c74fb4665a9635d3.jpg` |
| Sample | `https://static1.e621.net/data/sample/f3/59/f3590a911a687c67c74fb4665a9635d3.jpg` |
| Video sample | `https://static1.e621.net/data/sample/f3/59/f3590a911a687c67c74fb4665a9635d3_480p.mp4` |
| MP4 variant | `https://static1.e621.net/data/sample/f3/59/f3590a911a687c67c74fb4665a9635d3_alt.mp4` |

- **Previews** are thumbnails, at most 256 pixels on each side, in `.jpg` and `.webp`. Images and videos have one, Flash posts don't.
- **Samples** are smaller versions of large images, 850 pixels wide, in `.jpg` and `.webp`. Videos have one too, used as the poster image. Check `sample.has` (or `files.meta.has_sample` in the v2 format) before using it.
- Use the URLs from the API instead of building them, the format isn't guaranteed to stay the same.

## Formats

Post endpoints return one of two formats.

The default (legacy) format has `file`, `preview`, and `sample` objects:

```json
{
  "file": { "width": 640, "height": 640, "ext": "webm", "size": 216387, "md5": "f3590a...", "url": "..." },
  "preview": { "width": 256, "height": 256, "url": "...", "alt": "..." },
  "sample": { "has": true, "width": 850, "height": 850, "url": "...", "alt": "...", "alternates": { ... } }
}
```

With `v2=true`, all of this is in a single `files` object instead:

```json
{
  "files": {
    "meta": { "md5": "f3590a...", "ext": "webm", "size": 216387, "duration": 3.953, "has_sample": true },
    "original": { "width": 640, "height": 640, "url": "..." },
    "preview": { "width": 256, "height": 256, "jpg": "...", "webp": "..." },
    "sample": { "width": 850, "height": 850, "jpg": "...", "webp": "..." },
    "video": { "has": true, "original": { ... }, "variants": { ... }, "samples": { ... } }
  }
}
```

The `mode` parameter changes which fields are returned with `v2=true`. `thumbnail` returns a flat, much smaller object with just what's needed to show a thumbnail (`file_url`, `preview_url`, `sample_url`, `duration`, and so on).

## Video Files

Videos have extra files, in `sample.alternates` (legacy) or `files.video` (v2):

| Key | What it is |
|---|---|
| `original` | The original file |
| `variants.mp4` / `variants.webm` | The full resolution video converted to the other format |
| `samples.720p` / `samples.480p` | Smaller MP4 versions. Only the sizes smaller than the original exist. |

Each one has a `url`, `width`, `height`, `size`, `fps`, and `codec`. For the best compatibility, play the `mp4` variant, or a sample on slow connections.

## Hidden Files

File URLs are `null` when you can't see the post's files:

- **Deleted posts**, unless you're staff.
- **Login required:** some posts are hidden from logged out users.
- **Safe mode** (and e926.net) hides posts that aren't rated safe.

The post itself is still returned, so check for `null` before using a URL. The MD5 is still included, but building the URL yourself won't work for deleted posts, which are moved to a protected location.
