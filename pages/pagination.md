# Pagination

Index endpoints are paginated with the `page` and `limit` parameters.

- [Limit](#limit)
- [Page Numbers](#page-numbers)
- [Before and After](#before-and-after)
- [Iterating Everything](#iterating-everything)

## Limit

`limit` sets how many results are returned, between 0 and 320. The default is 75, except for posts, which use the logged in user's "posts per page" setting.

The `limit:` metatag works the same for post searches, see [Search Syntax](/searching/#sorting).

## Page Numbers

`page=<number>` gets that page of results, starting at 1.

- You can't go beyond page 750. Requesting a higher page returns a `410` error.
- Some endpoints have a smaller limit, for example post versions can't go past the first 10,000 results.
- Results shift between pages as things are created or deleted, so you can miss or repeat items while paging.

## Before and After

`page` also accepts an id, prefixed by `b` or `a`:

| Value | What it does |
|---|---|
| `page=b1000` | The results right before id 1000 (999, 998, ...) |
| `page=a1000` | The results right after id 1000 (1001, 1002, ...) |

Both return results with the highest id first, and ignore any custom order, including `order:` metatags. They aren't affected by the 750 page limit, and are much cheaper for the server.

## Iterating Everything

To go through every result of a search:

1. Request the first page without `page`.
2. Request `page=b<lowest id>`, using the lowest id from the previous response.
3. Repeat until you get an empty response.

To pick up new results later, store the highest id you've seen and request `page=a<highest id>`, then repeat with the highest id from each response until it's empty.

For very large datasets, like every post or tag, consider using the [DB Exports](/db-exports/) instead.
