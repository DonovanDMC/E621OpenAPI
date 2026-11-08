# User Levels

Many endpoints are limited to certain users. The descriptions use these terms:

- **`<Level>+`** means that level or higher, ex: "Janitor+" includes Janitors, Moderators, and Admins.
- **Permissions** and **flags** are given to users separately from their level.

- [Levels](#levels)
- [Permissions](#permissions)
- [Limits](#limits)

## Levels

`level` is returned as a number, and `level_string` as a name.

| Level | Name | Notes |
|---|---|---|
| 0 | Anonymous | Not logged in |
| 10 | Blocked | Banned users |
| 20 | Member | The default for new accounts |
| 30 | Privileged | Can use colors in DText, and gets higher limits |
| 40 | Former Staff | Former staff members, with Privileged's abilities and higher limits |
| 50 | Staff | |
| 60 | Janitor | |
| 70 | Moderator | |
| 80 | Admin | |

Staff+ in descriptions means level 50 or higher, Former Staff isn't included.

## Permissions

| Permission | What it allows |
|---|---|
| Approve Posts (`can_approve_posts`) | Approving and disapproving pending posts. Also called "Approver". |
| Unrestricted Uploads (`can_upload_free`) | Uploading without posts going to the approval queue. Users can also earn this through upload karma. |
| BD Staff (`is_bd_staff`) | Handling takedowns and the avoid posting list |
| BD Auditor (`is_bd_auditor`) | Viewing other users' DMails for audits |
| Replacements Beta (`replacements_beta`) | Submitting post replacements without being staff |

Users can also have abilities taken away, like `no_flagging` and `no_uploading`.

`can_approve_posts` and `can_upload_free` are included in the [current user](/#/Users) response.

## Limits

| Limit | Member | Privileged+ | Former Staff+ | Staff+ |
|---|---|---|---|---|
| Write requests per minute | 60 | 90 | 120 | 120 |
| API keys | 8 | 15 | 15 | 30 |

Upload limits are based on a user's upload history rather than their level, see `base_upload_limit` and the upload limit endpoint on [Users](/#/Users).
