# Tag Categories

Every tag has a category, returned as a number in `category`.

- [Categories](#categories)
- [Changing Categories](#changing-categories)
- [Searching](#searching)

## Categories

| Id | Name | Short | What it's for |
|---|---|---|---|
| 0 | General | `gen` | Anything not in another category |
| 1 | Artist | `art` | The artist who made the post |
| 2 | Contributor | `cont` | People who contributed to the post, like voice actors or commissioners |
| 3 | Copyright | `copy` | The franchise or series a post is from |
| 4 | Character | `char` | Named characters |
| 5 | Species | `spec` | The species of characters |
| 6 | Invalid | `inv` | Tags that shouldn't be used |
| 7 | Meta | `meta` | Information about the post itself, like its resolution or format |
| 8 | Lore | `lor` | Information about the characters that isn't visible, all ending in `_(lore)` |

## Changing Categories

- Tags can be given a category when they're added to a post, by prefixing them with the category name, ex: `species:wolf` or `char:some_character`. This sets the category of new tags. For existing tags, it only works for Staff+, on unlocked tags with fewer than 100 posts.
- Members can change the category of a tag with fewer than 100 posts, using [`PATCH /tags/{id}.json`](/#/Tags). Tags with more posts, and locked tags, can only be changed by Admins.
- Only Admins can use the Invalid, Meta, and Lore categories, and only Admins can create lore tags.
- Category changes are recorded in [tag type versions](/#/Tag%20Type%20Versions).

## Searching

- `search[category]` on [`GET /tags.json`](/#/Tags) filters tags by category.
- Post searches can count or sort by tags of a category, ex: `spectags:>2` or `order:species_tags`. See [Search Syntax](/searching/#counts).
