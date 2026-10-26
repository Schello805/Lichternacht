# Opt-in local authentication

## Production status, 24 October 2026

Local auth is active on the production server with release `v1.4.299`.
The original admin UID is preserved. The owner confirmed local login, editing
and reset-email delivery/form access. A fresh production browser made zero
Firebase requests, used Secure/HttpOnly/Strict cookies, saved visitor presence
and was denied private-data access and a foreign-Origin write.
Protected daily backups include auth accounts and configuration; restore was
verified without reviving sessions or reset links. Firebase project data remain
untouched as historical records; they are not the active authentication source.

The feature remains opt-in **for new installations**. Do not disable its
production systemd override or deploy older auth code without a coordinated
identity/data rollback.

`local_auth.py` uses only the Python standard library. Server and frontend support
the local mode, but it remains **off by default**. `LOCAL_AUTH_ENABLED=true` and
`LOCAL_DATABASE_ENABLED=true` must both be set for activation. Merely having an
auth database never enables authentication. The live deployment is not changed
by these source changes.

The browser probes `/api/local-auth/session` before loading any Firebase SDK.
With local auth enabled, login, anonymous identity, role checks, user creation,
logout and password recovery use only the local API. HttpOnly cookies contain
the actual sessions; the compatibility method `getIdToken()` returns only a
non-secret marker, not an authentication credential. The server never interprets
that marker or a legacy Firebase bearer as authorization in local mode.

## Integration API

Instantiate `LocalAuth(path)` with a **dedicated** SQLite file directly inside
`.private`, for example `.private/local-auth.sqlite3`. Never pass the data DB.
Existing unrelated tables are rejected. Restrict `.private` to mode 0700 and keep
it outside static serving, source control, exports and public backups. The auth
file is created/restricted to 0600; protect its directory and SQLite journals too.
No persistent connection is shared. Writes use immediate transactions with a
30-second busy timeout. Session lookups use short read transactions; expensive
scrypt login checks run outside the write transaction and recheck the credential
version before issuing a session. Password hashing is limited to two concurrent
operations with N=32768, r=8, p=3 and separate random salts.

- `create_admin(email, password, uid=None) -> user`: trusted administrative operation.
- `login(email, password) -> {token, user, expiresAt} | None`.
- `anonymous() -> {token, user, expiresAt}`: always a new `anon_` identity, never admin.
- `get_user(token) -> user | None`: validates an opaque session (not a JWT).
- `logout(token) -> None`: idempotent for well-formed tokens.
- `issue_reset(email) -> {token, expiresAt} | None`: invalidates previous resets.
- `reset_password(token, password) -> user | None`: atomic, single-use; revokes
  every session and reset belonging to that user. Does not create a session.
- `set_admin_password(email, password) -> user | None`: **offline recovery only**;
  same revocation behavior, preserves UID. Never expose publicly.
- `cleanup() -> None`: deletes expired sessions/resets; also runs on operations.
- `get_user_by_email(email) -> user | None`: trusted server lookup for reset delivery;
  do not expose an account-enumeration endpoint.
- `delete_admin(uid, actor_uid) -> bool`: actor must be a current backend admin;
  rejects self-deletion and last-admin deletion with ValueError, returns False
  for a missing target. Atomically removes credentials, sessions and resets.
  Derive actor_uid from the authenticated session, never request JSON. Existing
  data metadata is not deleted; it cannot confer authority in local-auth mode.

`user` is exactly `{uid, email, isAnonymous, isAdmin}`; anonymous email is null.
`expiresAt` is Unix seconds (float). Admin sessions last 12 hours, anonymous
sessions 30 days, reset tokens 30 minutes, all absolute/non-sliding.
Unknown credentials, expired/unknown tokens and unknown reset emails return None.
Malformed/oversized values, duplicate admin email/UID and weak new passwords raise
`ValueError`; translate validation failures to generic HTTP 400, never traceback.
New passwords require at least 12 characters and at most 1024 UTF-8 bytes.
Email matching is case-insensitive; no email ever confers authority automatically.
Only explicitly provisioned users are admins. UID validation permits the common
Firebase UID alphabet (letters, numbers, `_ . : @ -`, up to 128 characters).

The class is a trusted persistence boundary, not an HTTP authorization framework.
**Before calling create_admin from HTTP, require an authenticated existing admin.**
Never allow public bootstrap, even when the database is empty. Reject client role
claims. Backend user.isAdmin is authoritative in local-auth mode; legacy role
metadata must not upgrade a non-admin or anonymous identity. Preserve the UID for
compatibility, not to derive authority from arbitrary email/metadata matches.
Block generic data-API writes to users/globalAdmins while local auth is enabled.

## Bootstrap and offline recovery

Run locally in an interactive terminal (passwords are read twice with getpass;
never passed as arguments or printed):

```sh
python3 scripts/local-auth-admin.py --path .private/local-auth.sqlite3 create --email admin@example.org --uid EXISTING_FIREBASE_UID
python3 scripts/local-auth-admin.py --path .private/local-auth.sqlite3 set-password --email admin@example.org
```

Use the exact existing Firebase UID to preserve SQLite role mappings. CLI creation
requires --uid to avoid accidental migration to a random identity (the Python
API still supports uid=None). For a genuinely new identity, supply a new explicit UID.
Optionally add `--data-database /path/to/existing-data.sqlite3` to either command
to merge the canonical email into users metadata, preserving existing fields.
Existing email-to-UID conflicts are rejected before credential changes. The data
DB must already have the documents schema; auth hashes never enter that database.
The two databases do not share an atomic transaction: if metadata commit fails
after credentials save, repair/retry with set-password and --data-database.
Recovery needs only local filesystem access, no network, default password, reset
token output, or public bootstrap route. It cannot create an unknown admin.

## HTTP/browser boundary

Prefer `__Host-lichternacht_session` with Secure, HttpOnly, SameSite=Strict,
Path=/, no Domain, and expiration no later than the backend expiration. Serve
over HTTPS; clear the identical cookie on logout. The server extracts this token
and calls get_user. A non-browser Bearer client may supply its token to the same
method; reject ambiguous cookie/Bearer identities instead of silently mixing them.
Return only public user/mode from GET `/api/local-auth/session`, not token data.
Consume login/anonymous results server-side and set the cookie: never expose raw
sessions to JS. Use same-origin fetch credentials and exact trusted Origin checks
on every state-changing POST (including login/anonymous/logout). Do not enable
credentialed cross-origin access. Reject absent/untrusted browser Origins.

Keep a separate protected anonymous visitor cookie across admin login/logout.
Validate it with get_user and require isAnonymous=True before reuse; call anonymous()
only when there is no valid saved visitor session. Admin logout revokes only the
admin token and restores the saved visitor identity; never overwrite or revoke it
on admin login. Both cookies require the same Secure/HttpOnly/SameSite protections.
No live activation until CLI bootstrap and trusted reset delivery are verified;
keep LOCAL_AUTH_ENABLED off by default.

HttpOnly limits token theft by JS but does not stop XSS from making authenticated
requests. SameSite and Origin checks mitigate CSRF; HTTPS, CSP, output escaping,
request-size limits and login/reset rate limits remain necessary. LocalStorage
and JS-accessible bearer tokens are more vulnerable to persistent XSS theft.
Do not log passwords, cookies, Authorization headers or reset links/tokens.

POST request-reset must always return the same generic response regardless of
account existence and must **never return issue_reset's token to its requester**.
Deliver it only through an independently configured trusted recovery channel;
if none exists, use offline CLI recovery rather than a public token-disclosure
fallback. Reset links should avoid referrer leakage and third-party assets.
Persist only scrypt hashes with random salts and SHA-256 token digests; plaintext
tokens exist only in returned results for immediate secure delivery. Treat auth
DB backups as sensitive (password hashes can be attacked offline).

Run tests: `python3 -m unittest discover -s tests -p test_local_auth.py`.

## Safe production cutover

1. Back up the data DB, uploaded files, current settings and current code release.
2. Install the new code with local auth still disabled.
3. Use the CLI in the server terminal to create an admin with the **existing UID**
   and a new password entered only through getpass. Firebase passwords are not
   imported. Use `--data-database` to synchronize the existing user metadata.
4. Verify SMTP login and real reset-mail delivery. Reset tokens are never shown
   in HTTP responses, logs, admin CC messages or CLI output. Offline recovery is
   available even when mail fails.
5. Set `LOCAL_AUTH_PATH` to the dedicated `.private/local-auth.sqlite3`,
   `LOCAL_AUTH_ORIGIN=https://lichternacht-bechhofen.de`, and both feature flags.
   Restart the API. Do not infer the trusted origin from request/forwarded headers.
6. Verify admin login, logout, anonymous identity, editing, reset and cross-site
   rejection in a fresh browser. Verify there are no Firebase network requests.
7. Add the sensitive auth DB to protected **server-side** online SQLite backups;
   do not include password/session hashes in the browser's public-data JSON backup.
   Test offline restore before retiring Firebase Auth. Existing daily data/files
   backups do not automatically include this separately configured auth DB.
8. Update the privacy information to reflect the actually deployed auth mode
   before the final cutover. Keep legacy Firebase information while it is still
   used; do not remove it merely because the new source code exists.

Anonymous local identities are new; historical Firebase-owned check-ins are not
silently reassigned based on untrusted browser IDs. Existing favorites and the
device-local pass remain in localStorage, but server-side check-in ownership and
deduplication must be reconciled before switching an event with existing live
check-ins. Do the cutover before the event, or implement a verified identity
transfer first. Preserve old records and Firebase project backups until checked.

Admin deletion revokes sessions, cannot delete the acting/last admin, and uses
dedicated auth endpoints. Generic data writes cannot change role collections
when local auth is enabled. Password reset revokes all admin sessions and requires
a new login; reset links use URL fragments and are removed before analytics runs.

An existing browser remembers that local auth is required and fails closed when
the endpoint disappears rather than silently switching authentication providers.
A rollback therefore requires an explicit coordinated data/identity migration,
not just disabling the feature flag. Do not delete Firebase before this check.

## Sensitive authentication backup

```sh
python3 scripts/backup-local-auth.py --source /safe/.private/local-auth.sqlite3 --output /backup/.private/auth-2026-10-24.sqlite3
```

The online SQLite backup preserves administrator credentials, is created with
0600 permissions, never overwrites an existing file and is integrity-checked.
Sessions and password reset links are deliberately removed from the backup so
that restoring an older snapshot cannot revive revoked access. Stop the API,
restore this file to the configured auth path, keep it private and restart the
API. Users must log in again. The live source sessions are not changed by backup.
