# Search Syntax

This is the syntax used by the `tags` parameter of [`GET /posts.json`](/#/Posts), and anywhere else that takes a post search (like `search[post_tags_match]`). It's adapted from e621's [cheatsheet](https://e621.net/wiki_pages/e621:cheatsheet), with a few API specific notes.

- [Basics](#basics)
- [Sorting](#sorting)
- [User Metatags](#user-metatags)
- [Post Metatags](#post-metatags)
- [Range Syntax](#range-syntax)
- [Saved Searches](#saved-searches)
- [Deleted Posts](#deleted-posts)

## Basics

| Search | What it does |
|---|---|
| `cat dog` | Posts tagged with both `cat` and `dog`. Tags are separated by spaces. |
| `red_panda` | Words within a tag are separated by underscores. |
| `~cat ~dog` | Posts tagged with `cat`, `dog`, or both. |
| `-chicken` | Posts not tagged with `chicken`. |
| `fox -chicken` | Posts tagged with `fox`, but not `chicken`. |
| `african_*` | Posts with any tag starting with `african_`. Only the 40 most used matching tags are checked. |
| `-african_*` | Posts with no tags starting with `african_`. |
| `( ~cat ~tiger ) ( ~dog ~wolf )` | Posts with `cat` or `tiger`, and `dog` or `wolf`. |

- A search can have up to 40 tags. Metatags count toward this limit.
- Parentheses must be surrounded by spaces, so `( cat )` is a group but `(cat)` is a tag.
- Groups can use the `-` and `~` prefixes, ex: `~( felid -leopard ) ~( leopard tiger )`.
- Groups can be nested up to 10 levels deep.
- Wildcards don't combine well with `~`. `~african_*` is searched as a literal tag, which won't match anything.
- Any metatag value can be wrapped in double quotes, which is only useful for values with spaces, ex: `description:"hello there"`.

## Sorting

Posts are sorted newest first by default, the same as `order:id_desc`. Almost all orders can be reversed by adding `_asc`, or by negating them, so `-order:score` is the same as `order:score_asc`.

| Search | What it does |
|---|---|
| `order:id` | Oldest to newest |
| `order:id_desc` | Newest to oldest |
| `order:score` | Highest score first |
| `order:favcount` | Most favorites first |
| `order:comment_count` | Most comments first |
| `order:comment` | Most recently commented first |
| `order:comment_bumped` | Most recently bumped by a comment first |
| `order:note` | Most recently noted first |
| `order:created` | Newest post date first |
| `order:updated` | Most recently updated first |
| `order:change` | Highest change sequence first |
| `order:mpixels` | Largest resolution first |
| `order:filesize` | Largest file size first |
| `order:duration` | Longest videos first |
| `order:landscape` | Wide and short first |
| `order:portrait` | Tall and thin first |
| `order:tagcount` | Most tags first |
| `order:<category>_tags` | Most tags of a category first, ex: `order:species_tags` |
| `order:md5` | Highest MD5 first |
| `order:deleted` | Most recently deleted first. Includes deleted posts. |
| `order:flagged` | Most recently flagged first |
| `order:hot` | The order used by the "Hot" page. Cannot be reversed. |
| `order:random` | Random order. Cannot be reversed. |
| `randseed:<number>` | Random order with a fixed seed, so the same seed gives the same results across pages. |

Shorthands: `created_at`, `updated_at`, `comm`, `comm_bumped`, `comm_count`, `size` (filesize), `ratio`/`aspect_ratio`, `rank` (hot), and `<short>tags` (ex: `spectags`) all work as order values.

The `limit:` metatag sets the number of posts per page (max 320), like the `limit` query parameter.

## User Metatags

Users can be given by name, by id with `!` (ex: `user:!17633`), or as `me` for the logged in user.

| Search | What it does |
|---|---|
| `user:Bob` | Posts uploaded by Bob |
| `user_id:17633` | Posts uploaded by the user with id 17633. Doesn't support `!` or `me`. |
| `fav:Bob` / `favoritedby:Bob` | Posts favorited by Bob. Fails if Bob's favorites are hidden. |
| `approver:Bob` | Posts approved by Bob. Also accepts `any` and `none`. |
| `deletedby:Bob` / `deleter:Bob` | Posts deleted by Bob |
| `commenter:Bob` / `comm:Bob` | Posts commented on by Bob. Also accepts `any` and `none`. |
| `noter:Bob` | Posts with notes written by Bob. Also accepts `any` and `none`. |
| `noteupdater:Bob` | Posts with notes updated by Bob |
| `voted:me` / `vote:me` | Posts you voted on |
| `upvote:me` / `votedup:me` / `upvoted:me` / `voteup:me` | Posts you upvoted |
| `downvote:me` / `voteddown:me` / `downvoted:me` / `votedown:me` | Posts you downvoted |
| `flagger:Bob` / `flaggedby:Bob` | Posts flagged by Bob. Staff only. |

The vote metatags only search the logged in user's votes, whatever value is given. Moderators can search other users' votes.

## Post Metatags

### Counts

All of these support [ranges](#range-syntax).

| Search | What it does |
|---|---|
| `id:100` | The post with id 100 |
| `score:100` | Posts with a score of 100 |
| `favcount:100` | Posts with 100 favorites |
| `comment_count:100` | Posts with 100 comments |
| `tagcount:2` | Posts with 2 tags |
| `<short>tags:2` | Posts with 2 tags of a category. One of `gentags`, `arttags`, `conttags`, `copytags`, `chartags`, `spectags`, `invtags`, `metatags`, or `lortags`. |
| `change:100` | Posts with a change sequence of 100 |

### Rating

| Search | Shorthand | What it does |
|---|---|---|
| `rating:safe` | `rating:s` | Posts rated safe |
| `rating:questionable` | `rating:q` | Posts rated questionable |
| `rating:explicit` | `rating:e` | Posts rated explicit |

### File Types

`type:` (or `filetype:`) takes one of `jpg`, `png`, `gif`, `webp`, `mp4`, `webm`, or `swf`.

### Size and Duration

All of these support [ranges](#range-syntax).

| Search | What it does |
|---|---|
| `width:100` | Posts 100 pixels wide |
| `height:100` | Posts 100 pixels tall |
| `mpixels:1` | Posts with 1 megapixel |
| `ratio:4:3` | Posts with a 4:3 aspect ratio. Decimals work too, rounded to 2 digits, ex: `ratio:1.33`. |
| `filesize:200KB` | Posts around 200 KB (within 5%). Accepts `KB`, `MB`, or bytes. |
| `duration:>120` | Videos longer than 120 seconds |

### Status

| Search | What it does |
|---|---|
| `status:pending` | Posts waiting to be approved |
| `status:active` | Approved posts |
| `status:deleted` | Deleted posts |
| `status:flagged` | Posts flagged for deletion |
| `status:modqueue` | Pending or flagged posts |
| `status:any` / `status:all` | All posts, including deleted ones |

Only one `status:` metatag can be used per group, and it doesn't support the `~` prefix.

### Dates

`date:` supports [ranges](#range-syntax).

| Search | What it does |
|---|---|
| `date:2012-04-27` | Posts uploaded on a day. Year-month-day is assumed, `april/27/2012` also works. |
| `date:today` / `date:yesterday` | Posts uploaded today or yesterday |
| `date:day` / `date:week` / `date:month` / `date:year` / `date:decade` | Posts uploaded in the last day, 7 days, 30 days, 365 days, or 10 years |
| `date:5_days_ago` | Posts uploaded within the last 5 days. Also `weeks`, `months`, and `years`. |
| `date:yesterweek` / `date:yestermonth` / `date:yesteryear` | Posts uploaded last week, month, or year |
| `date:5_yesteryears_ago` | Posts uploaded 5 years ago |
| `age:<2d` | Posts uploaded less than 2 days ago |
| `age:1w..1mo` | Posts uploaded between 1 week and 1 month ago |

`age:` takes a number and a unit: `s`, `mi`, `h`, `d`, `w`, `mo`, or `y` (the full words work too). Without a unit, days are assumed.

### Text

| Search | What it does |
|---|---|
| `source:*example.com` | Posts with a source starting with the value. Use wildcards as needed. |
| `source:none` / `source:any` | Posts with no source, or any source |
| `description:whatever` | Posts with a description containing the text |
| `note:whatever` | Posts with a note containing the text |
| `delreason:*whatever` | Deleted posts with a deletion reason starting with the value |
| `flagreason:*whatever` | Posts with a flag reason starting with the value |
| `flagnote:*whatever` | Posts with a flag note starting with the value. Staff only. |

### Parents and Children

| Search | What it does |
|---|---|
| `parent:1234` | Posts with 1234 as their parent |
| `parent:none` / `parent:any` | Posts with no parent, or any parent |
| `child:none` / `child:any` | Posts with no children, or any children |
| `ischild:true` / `hasparent:true` | Posts that are a child. Use `false` for the opposite. |
| `isparent:true` / `haschild:true` / `haschildren:true` | Posts that are a parent. Use `false` for the opposite. |

### Locks

| Search | What it does |
|---|---|
| `locked:rating` / `ratinglocked:true` | Posts with their rating locked |
| `locked:note` / `notelocked:true` | Posts with their notes locked |
| `locked:status` / `statuslocked:true` | Posts with their status locked |

Use `-locked:<type>` or `<type>locked:false` for unlocked posts.

### Other

| Search | What it does |
|---|---|
| `hassource:true` | Posts with a source. Use `false` for the opposite. |
| `hasdescription:true` | Posts with a description. Use `false` for the opposite. |
| `inpool:true` | Posts in a pool. Use `false` for the opposite. |
| `pending_replacements:true` | Posts with pending replacements. Use `false` for the opposite. |
| `artverified:true` | Posts uploaded by a verified artist. Use `false` for the opposite. |
| `pool:4` / `pool:fox_and_the_grapes` | Posts in a pool, by id or name. Also accepts `any` and `none`. |
| `set:17` / `set:cute_rabbits` | Posts in a set, by id or short name |
| `md5:02dd017837ba30c343cbfc38e159daf0` | The post with an MD5. Separate multiple with commas. |
| `search:name` | Posts matching one of your [saved searches](#saved-searches) |

## Range Syntax

| Search | Same as | What it does |
|---|---|---|
| `score:100` | | Exactly 100 |
| `score:25..50` | | Between 25 and 50 |
| `score:>=100` | `score:100..` | 100 or more |
| `score:>100` | `-score:<=100` | More than 100 |
| `score:<=100` | `score:..100` | 100 or less |
| `score:<100` | `-score:>=100` | Less than 100 |
| `id:100,121,144` | | Any of the values, up to 320 |

## Saved Searches

`search:<name or id>` matches the posts of one of the logged in user's [saved searches](/#/Saved%20Searches), as if its query was wrapped in a group. It supports the `-` and `~` prefixes.

- `search:subscriptions` matches posts with any of your [subscribed tags](/#/Tag%20Subscriptions).
- A search that can't be found matches nothing.
- Saved search queries can't contain wildcard tags or other `search:` metatags.

## Deleted Posts

Deleted posts are hidden from results unless the search includes one of:

- `status:deleted`, `status:active`, `status:any`, or `status:all`
- `-status:` with one of those values, which still filters them explicitly
- `deletedby:` or `delreason:`, with any value
- `flagger:`, `flagreason:`, or `flagnote:`, with any value
- `order:deleted`
