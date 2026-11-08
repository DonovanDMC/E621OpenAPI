# DB Exports

e621 publishes daily exports of its public data as gzipped CSV files. If you need a large amount of data, like every post or tag, download these instead of crawling the API.

- [Files](#files)
- [Columns](#columns)
- [Usage Notes](#usage-notes)

## Files

[`GET /db_exports.json`](/#/System) lists the exports, with their URL, size, SHA-256 checksum, and when they were last generated:

```json
{
  "name": "tags",
  "file_name": "tags.csv.gz",
  "file_size": 12345678,
  "checksum": "6232313544187da61ca88998d10e639f3634e2df0326fcd6c0a099c3a4ae2dd5",
  "updated_at": "2026-11-07T23:00:08.613-05:00",
  "url": "https://static1.e621.net/data/db_export/tags.csv.gz"
}
```

The exports are regenerated every day at 04:00 UTC, and the file names don't change. Use `updated_at` or `checksum` to tell when a new export is available.

| Export | Contents |
|---|---|
| `posts` | Every post, including deleted ones (~2 GB) |
| `post_versions` | Every post edit (~10 GB) |
| `post_replacements` | Post replacements |
| `tags` | Every tag, with its category and post count |
| `tag_aliases` | Tag aliases, with their votes |
| `tag_implications` | Tag implications, with their votes |
| `bulk_update_requests` | Bulk update requests |
| `artists` | Artists |
| `pools` | Pools, with their post ids |
| `wiki_pages` | Wiki pages, with their DText bodies |

## Columns

Each file starts with a header row. Some of the larger exports:

| Export | Columns |
|---|---|
| `posts` | `id`, `uploader_id`, `created_at`, `md5`, `source`, `rating`, `image_width`, `image_height`, `tag_string`, `locked_tags`, `fav_count`, `file_ext`, `parent_id`, `change_seq`, `approver_id`, `file_size`, `comment_count`, `description`, `duration`, `updated_at`, `is_deleted`, `is_pending`, `is_flagged`, `score`, `up_score`, `down_score`, `is_rating_locked`, `is_status_locked`, `is_note_locked`, `bg_color`, `last_noted_at`, `last_commented_at` |
| `tags` | `id`, `name`, `category`, `post_count`, `created_at`, `updated_at`, `is_locked` |
| `tag_aliases` | `id`, `antecedent_name`, `consequent_name`, `created_at`, `status`, `forum_post_id`, `forum_topic_id`, `reason`, `updated_at`, `creator_id`, `approver_id`, `post_count`, `down_votes`, `meh_votes`, `up_votes` |
| `pools` | `id`, `name`, `created_at`, `updated_at`, `creator_id`, `description`, `is_active`, `category`, `post_ids` |
| `wiki_pages` | `id`, `created_at`, `updated_at`, `title`, `body`, `creator_id`, `updater_id`, `is_locked`, `parent` |

## Usage Notes

- `tags.category` is a number, see [Tag Categories](/tag-categories/).
- Array columns like `pools.post_ids` use PostgreSQL's format, ex: `{1,2,3}`.
- File URLs aren't included in `posts`, see [Post Files](/post-files/) for how they relate to the `md5`.
- To keep an export up to date, page through newer records with `page=a<id>`, see [Pagination](/pagination/#iterating-everything).
