# Errors and Rate Limits

- [Rate Limits](#rate-limits)
- [Error Formats](#error-formats)
- [Status Codes](#status-codes)

## Rate Limits

- **All requests:** e621 has a hard limit of 2 requests per second. If you're hitting it, you're already going too fast. Exceeding it returns a `503`.
- **Writes:** non-GET requests from logged in users are limited per minute, to 60 for Members, 90 for Privileged+, and 120 for Former Staff+. These responses include an `X-Api-Limit` header with how many you have left. Exceeding it returns a `429`.
- **Specific endpoints:** some endpoints have their own, lower limits, like IQDB queries and DText previews. These are noted on the endpoint, and also return a `429`.

Back off and retry later when you get a `429` or `503`.

## Error Formats

Most errors look like this:

```json
{
  "success": false,
  "message": "You cannot go beyond page 750. Please narrow your search terms.",
  "code": null
}
```

`code` is an id for unexpected errors, include it if you report the problem.

A few errors use a different shape:

| Status | Body |
|---|---|
| `403` | `{"success": false, "reason": "Access Denied"}`, the reason may include more detail, ex: `Access Denied: Must be logged in` |
| `404` | `{"success": false, "reason": "not found"}` |
| `422` | Validation failures from creating or updating something use `{"errors": {"field": ["is invalid"]}}` |
| `412` | Uploads, see [`POST /uploads.json`](/#/Uploads) |

Errors from Cloudflare (`5xx` codes above 520) and some `503`s are HTML, not JSON.

## Status Codes

| Status | Meaning |
|---|---|
| `200` | Success |
| `201` | Created |
| `204` | Success, with no response body. Common for updates and deletes. |
| `400` | Bad request, or the feature isn't available |
| `401` | Authentication failed, see [Authentication](/authentication/#failures) |
| `403` | Access denied. Can also mean the request is missing a user agent. |
| `404` | Not found |
| `405` | The method isn't allowed for the URL. Switching between POST, PATCH, and PUT usually fixes it. |
| `406` | The format isn't supported. Most endpoints only support `.json` (and HTML). |
| `410` | Invalid pagination, like going beyond page 750. See [Pagination](/pagination/). |
| `412` | An upload was invalid or a duplicate |
| `413` | The request was too large |
| `422` | Invalid input. Also used for searches that are too complex, have too many tags, or time out, and for GET parameters over 16 KB. |
| `429` | Rate limited |
| `500` | Server error. A database timeout also returns this. |
| `502` | Cloudflare couldn't reach e621 |
| `503` | Rate limited, or e621 is unavailable |
| `520`, `522`, `524`, `525` | Cloudflare errors connecting to e621 |
