# Admin editing tools and request email — design

Date: 2026-10-08 · Status: approved in chat, awaiting spec review

## Goal

The site owner (non-technical) wants to run the site from the admin dashboard
without touching code, SQL, or the Supabase Table Editor after a one-time setup,
and wants every service request emailed to them.

Success means an admin can, from `dashboard.html`:

1. Edit an existing event, and hide/show it.
2. Change the platform leader/deputy and each department's leader/deputy,
   including their titles (قائد/قائدة, نائب/نائبة).
3. Edit the homepage intro, mission, vision, the six department card
   descriptions, and the six stat cards.
4. Make another member an admin or remove their admin access.

And every service request (web, games, branding) sends an email to
**yazedksa23@gmail.com**.

Out of scope: footer contact/social links, adding/removing stat cards or
departments, editing department names, uploading images, a CAPTCHA.

## Decisions

| Question | Decision | Why |
| --- | --- | --- |
| Where homepage content lives | Supabase tables, HTML keeps current text as fallback | Edits are live instantly, same admin login, page never blank |
| Email delivery | FormSubmit AJAX from the browser, after the request is saved | Zero accounts or keys; owner clicks one activation link once |
| Which requests email | All service types | Owner's choice |
| Who can manage admins | Admins only, never their own role | Prevents self-lockout |

## 1. Database — `supabase/migrations/202610080002_admin_content.sql`

Additive only; run once in the SQL Editor after the init migration. Transactional.

**`platform_settings`** — add `hero_text`, `mission_text`, `vision_text`
(`text not null default ''`, ≤ 1000 chars), `leader_title`
(`'قائد المنصة' | 'قائدة المنصة'`), `deputy_title` (`'نائب القائد' | 'نائبة القائد'`).
Seed with the current homepage wording and current titles.

**`departments`** — add `description` (≤ 500 chars), `leader_title`
(`'قائد القسم' | 'قائدة القسم'`), `deputy_title` (`'نائب القسم' | 'نائبة القسم'`).
Add length checks (≤ 150) to `leader` and `deputy`. Seed descriptions from the
homepage cards and titles from `structure.html`.

**`home_stats`** (new) — `slug text primary key`, `value` (1–20 chars),
`label` (1–100), `caption` (≤ 200), `sort_order`. Seeded with the six current
cards: `volunteer_hours`, `followers`, `partnerships`, `training_hours`,
`events`, `members`. Icons stay in HTML. RLS on: public read; admin update only
(rows cannot be inserted or deleted from the browser). Grants: `select` to
anon/authenticated, `update(value, label, caption)` to authenticated.

**Event capacity guard** — trigger on `events` update: if the new `capacity`
is below the current registration count, raise `P0001`
`'عدد المقاعد أقل من عدد المسجلين'`. Editing events is otherwise already
allowed for admins by the existing `events_admin` policy.

**`public.set_member_role(p_user_id uuid, p_role text) returns void`** —
`security definer`, empty `search_path`, executable by `authenticated` only.
- Not admin → `42501`.
- `p_role` not in `member`/`admin` → `22023`.
- `p_user_id = auth.uid()` → `P0001` `'لا يمكنك تغيير صلاحياتك'`.
- Unknown user → `P0001` `'العضو غير موجود'`.
- Promoting also sets `membership_status = 'active'`; demoting leaves status unchanged.

## 2. API — `api.js`

New/changed functions on `window.ErtwaAPI` (all admin writes call `requireAdmin()` first):

- `updateEvent(id, input)` — shares validation with `addEvent` via one
  `eventFields(input)` helper. Empty image keeps the default image.
- `setEventPublished(id, published)`.
- `siteContent()` — public read of settings, departments, stats (replaces
  `structureData()`; structure page uses it too).
- `saveSettings(input)`, `saveDepartment(slug, input)`, `saveStat(slug, input)`.
- `listMembers()` — all profiles (admins can already read them), newest first.
- `setMemberRole(userId, role)` — calls the RPC.
- `submitServiceRequest(input)` — after the insert succeeds, sends the email
  (below) without waiting for it; an email failure never turns a saved request
  into an error for the visitor.

**Request email.** `supabase-config.js` gains
`requestNotificationEmail: 'yazedksa23@gmail.com'`. If set, `api.js` POSTs JSON to
`https://formsubmit.co/ajax/<address>` with `keepalive: true`:
`_subject` = `طلب جديد: <service label> — <client name>`, `_template` = `table`,
`_captcha` = `false`, `email` (client's address, becomes reply-to), plus name,
service, description, budget, timeline. Values are sent as plain text fields.
Note: the address is visible in the public page source; FormSubmit's
random-string alias can replace it later without code changes.

## 3. Public pages

- **`index.html`** — add `data-content` (hero/mission/vision), `data-dept`
  (department cards), `data-stat` (stat cards) attributes. `main.js`
  `loadHomeContent()` fills non-empty database values via `textContent`; on any
  failure the existing HTML text stays.
- **Stat animation (`script.js`)** — the counter stops and shows the database
  value if one arrives mid-animation (`stat.dataset.final`), so a late response
  cannot be overwritten by the old number.
- **`structure.html`** — cards get `data-dept="<slug>"` (replaces matching by
  display name); leader/deputy titles and the two platform titles are filled
  from the database. Platform title text moves into its own `<span>` so the icon
  is kept.

## 4. Dashboard — `dashboard.html`, `admin.js`, new `admin-content.js`

- **Events (admin.js)** — each row gets **تعديل** and **إخفاء / إظهار**; hidden
  events are labelled. **تعديل** loads the event into the existing form, the
  heading becomes «تعديل الفعالية», submit becomes «حفظ التعديلات», and an
  **إلغاء** button restores add mode. Time is trimmed to `HH:MM`; the default
  relative image shows as an empty field.
- **الأعضاء والمشرفين (admin.js)** — table of name, email, role, status with
  «ترقية لمشرف» / «إزالة الإشراف» (confirm dialog). The signed-in admin's row has
  no button.
- **الهيكل التنظيمي (admin-content.js)** — platform row plus six department rows:
  leader, title select, deputy, title select, homepage description; one
  **حفظ** per row.
- **محتوى الصفحة الرئيسية (admin-content.js)** — hero, mission, vision textareas
  and six stat rows (value, label, caption); one **حفظ** that saves settings then
  each stat, reporting the first error.
- `admin-content.js` is added to `dashboard.html` and the build's asset list.
  Every save shows success or the mapped Arabic error inline, like existing forms.

## 5. Testing

Run locally with Node 24 placed in the session temp folder, and again in CI.

- **Database (PGlite)** — load both migrations. Anon reads new content; member
  cannot update content/stats/settings or call `set_member_role` (`42501`);
  admin can; admin promotes (role + active) and demotes another user; admin
  cannot change own role; invalid role rejected; capacity below registrations
  rejected; table-count assertion becomes nine.
- **Frontend (happy-dom)** — homepage shows database content and keeps fallback
  text on failure; structure page fills by slug with titles; order page emails
  only after a successful save, to the configured address with the right
  subject, and a failing email still shows success; admin can edit an event
  (calls `updateEvent` with the id and trimmed time); members table hides the
  button on the admin's own row and calls `setMemberRole`.

## 6. Rollout

1. Build and test locally.
2. Owner runs `202610080002_admin_content.sql` once in the SQL Editor
   (direct link provided). Until then the public pages keep their HTML text.
3. Push; CI tests and deploys.
4. Send one FormSubmit activation request from the live site's origin; owner
   clicks «Activate Form» in the email at yazedksa23@gmail.com.
5. Owner signs up, and the one-time SQL makes them the first admin; after that,
   admins are managed from the dashboard.
