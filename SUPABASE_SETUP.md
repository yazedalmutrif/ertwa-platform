# Connect Ertwa to Supabase

The backend uses Supabase Auth, PostgreSQL tables, row level security (RLS), and
database functions. The website stays plain HTML/CSS/JavaScript and can still be
hosted on GitHub Pages. No separate Node server or secret key is needed to run it.

## 1. Create the database

Create a Supabase project. In its **SQL Editor**, run the complete contents of
[`supabase/migrations/202610080001_init.sql`](supabase/migrations/202610080001_init.sql)
once. This migration is intended for a new project: do not run it over existing
tables with the same names. It seeds the six departments and the leadership names
already present in the website. Events start empty so an admin can add real ones.

The SQL is transactional. If execution fails, fix the reported error before
retrying; do not skip the permission statements. Keep `public` exposed in the
Data API settings and keep `private` outside the exposed schemas.

## 2. Add the public connection settings

Copy your **Project URL** and **publishable key** from the project's connection/API
settings into [`supabase-config.js`](supabase-config.js):

```js
window.ERTWA_CONFIG = {
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    supabasePublishableKey: 'sb_publishable_YOUR_KEY'
};
```

The legacy `anon` key also works. Use the publishable/anon key only: secret and
`service_role` keys bypass RLS and must never be placed in browser files.
Supabase documents the [browser key model](https://supabase.com/docs/guides/getting-started/api-keys)
and [RLS permissions](https://supabase.com/docs/guides/database/postgres/row-level-security).

These settings are intentionally public, so they can be deployed with the static
site. This project does not load `.env` files into the browser.

## 3. Configure email login

Enable the email/password provider in Supabase **Authentication**. Keep email
confirmation enabled. In **Authentication → URL Configuration**, set your Site
URL to the deployed site and add the exact confirmation redirect URLs, such as:

```text
http://localhost:5500/dashboard.html
https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/dashboard.html
```

Use your actual domain and repository path. Start a local server instead of
opening the HTML through `file://`:

```sh
python3 -m http.server 5500 --bind 127.0.0.1
```

Open `http://localhost:5500/register.html`, complete the wizard, and confirm the
email. The database trigger saves the profile and application in the same signup
transaction, so both exist before email confirmation. New accounts have a pending
membership; approval happens separately in the admin dashboard. Passwords are
managed by Supabase Auth and are never saved in application tables.

Existing accounts should use `login.html`. Supabase's [signup behavior](https://supabase.com/docs/reference/javascript/auth-signup)
may conceal duplicate accounts; the form will not claim that a duplicate
application was saved. Membership applications currently support one submission
per account; changing committees or resubmitting a rejected application is not
implemented.

## 4. Make your account an admin

After creating and confirming your account, run this in the **SQL Editor**,
replacing the email with your own:

```sql
update public.profiles
set role = 'admin', membership_status = 'active'
where id = (
  select id from auth.users where lower(email) = lower('YOUR_EMAIL@example.com')
)
returning id, email, role;
```

Confirm that the query returns your account, then sign in and open
`dashboard.html`. The dashboard lets admins add/delete events, review committee
applications and their answers, update service request statuses, and approve or
reject contribution reports. To remove admin access, update `role` to `member` in
the SQL Editor. Browser users cannot edit their own role or membership approval.

## Stored data and permissions

| Table | Access from the website |
| --- | --- |
| `profiles` | Members read their own profile; admins read all. Auth creates profiles. |
| `membership_applications` | Members read their own application; admins review through an atomic function. |
| `events` | Visitors read published events; admins manage events. |
| `event_registrations` | Members read their own registrations; admins read all; registration uses a database function. |
| `service_requests` | Guests submit without reading; signed-in owners read their own; admins read all and update status. |
| `contributions` | Members submit/read their own; admins approve status; only approved hours count. |
| `departments`, `platform_settings` | Public read; admins may edit through Supabase's Table Editor or authorized API calls. |

Events use structured dates and times interpreted in **Asia/Riyadh**. Registration
locks the event row, checks remaining seats and time, and is idempotent for the
same user/event. Deleting an event deletes its registrations as well.

Guests' service requests are not attached to an account by matching an email.
Sign in before submitting if you want the request to appear in your dashboard.
The public service form intentionally allows guest submissions; it does not yet
include CAPTCHA or per-client rate limiting. The homepage's social/training
statistics remain editorial content; they are no longer randomly incremented.

## Verification

With Node.js 20+ installed:

```sh
npm ci
npm test
```

Tests execute the migration and permissions in an isolated PostgreSQL instance
using PGlite, with a minimal Auth schema, and exercise the forms in a DOM
environment. They do not modify your Supabase project. No test libraries are
loaded by the live website.

After connecting a real project, verify signup and email confirmation, a rejected
login, member/admin dashboard access, event registration, a guest service request,
and contribution approval. These hosted Auth, email, and Data API flows require
your project configuration and cannot be verified by the local tests alone.

The frontend loads Supabase JS **2.117.3** from jsDelivr, pinned to avoid unplanned
SDK changes. Internet access is required for that library and the backend.
