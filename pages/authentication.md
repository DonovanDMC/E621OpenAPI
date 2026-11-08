# Authentication

Most read endpoints work without logging in. Anything that writes data, or reads data tied to your account, needs one of the methods below.

- [User Agent](#user-agent)
- [API Keys](#api-keys)
- [OAuth](#oauth)
- [CSRF Tokens](#csrf-tokens)
- [Failures](#failures)

## User Agent

Every request needs a descriptive, non-empty `User-Agent` header, ideally including your e621 username so you can be contacted if your project causes problems, ex: `MyProject/1.0 (by username on e621)`.

- Don't impersonate a browser's user agent, that will get you blocked.
- Default user agents from languages and libraries are usually blocked.
- If you can't set headers (like in a browser), add a `_client` query parameter with your user agent instead.

## API Keys

API keys are created from your profile page (Account > My profile > Manage API Keys). Users can have up to 8 keys, 15 for Privileged+, and 30 for Staff+.

The preferred way to send a key is Basic auth in the `Authorization` header, with your username and the key:

```
Authorization: Basic base64(username:api_key)
```

```js
fetch("https://e621.net/posts.json?limit=10", {
  headers: {
    "Authorization": "Basic " + btoa(`${username}:${apiKey}`),
    "User-Agent": "MyProject/1.0 (by username on e621)"
  }
});
```

If you can't set headers, you can send `login` and `api_key` as query or body parameters instead:

```
https://e621.net/posts.json?login=username&api_key=your_api_key
```

## OAuth

e621 is also an OAuth 2.0 and OpenID Connect provider, for apps acting on behalf of other users. The configuration is at [`/.well-known/openid-configuration`](https://e621.net/.well-known/openid-configuration).

- Only the authorization code flow is supported, with PKCE (`S256`), and refresh tokens.
- Send the access token as `Authorization: Bearer <token>`.
- API requests need the `full` scope. `openid`, `profile`, and `email` only cover the OpenID Connect endpoints like [`/oauth/userinfo`](/#/OpenID%20Connect).
- Applications can only be registered by Staff+, and can require a minimum user level.

## CSRF Tokens

Browser sessions (the `_danbooru_session` cookie) need a CSRF token for anything that isn't a GET request. Requests authenticated with the `Authorization` header don't, and neither do `login`/`api_key` requests that don't send a cross-site `Origin` header. If you're writing a userscript running on e621, the token is in the `csrf-token` meta tag.

## Failures

| Status | Meaning |
|---|---|
| `401` | The credentials were wrong, the account is banned, or an OAuth token is missing the `full` scope or is below the application's minimum level |
| `403` | You're logged in but can't do that, or the request is missing a user agent. See [Errors](/errors/). |

Invalid credentials always fail, they never fall back to being logged out.
