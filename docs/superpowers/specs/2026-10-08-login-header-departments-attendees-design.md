# Login header, managed departments, event attendee sheet — design

Date: 2026-10-08 · Status: design approved in chat, awaiting spec review

## Goal

1. **Bug:** after signing in, other pages still show «تسجيل الدخول» and offer no way
   to sign out. Root cause: every public header has a static login button and no
   code reads the saved session; `departments.html` loads no site scripts at all.
2. Admins create, edit and delete (hide) departments from the dashboard.
3. Event registration asks for a phone number; admins see a per-event attendee
   sheet (name, email, phone, time) and download it for Excel. Nobody else can.

Owner choices: header shows account + logout; phone asked at every event
registration (not at signup); deleting hides and keeps history; new departments
use a standard question set.

Out of scope: per-department custom questions, image uploads, reordering by drag,
guest (signed-out) event registration.

## 1. Header session state

- `main.js` `setupHeader()` runs on every page that has `.main-header .btn-login`
  and no `#logout-button`. Signed in → the login button is replaced by
  «لوحة التحكم» (to `dashboard.html`) and «تسجيل الخروج» (calls `signOut`, then
  `index.html`). Signed out or on error → the login button stays.
- `login.html`: a visitor who is already signed in is sent to `dashboard.html`.
- `departments.html` loads Supabase JS, `supabase-config.js`, `api.js`,
  `script.js`, `main.js` like the other pages.

## 2. Departments

**Database (`202610080003_departments_attendees.sql`, additive):**
- `departments` gains `page_title` (≤ 200), `details` (≤ 2000), `tasks`
  (≤ 2000, one task per line), `icon` (`^fa-[a-z0-9-]{1,40}$`, default
  `fa-layer-group`), `image` (`''` or `images/<file>`), `active boolean default true`;
  `name` and `display_name` get length checks (1–100, 1–150).
  `slug` defaults to `'dept-' || 8 random hex chars`.
- Seed the six departments from the current pages: `page_title`/`details`/`tasks`/
  `icon` from `departments.html`, `image` = the homepage `Overlay(n).svg`.
- Browsers lose `delete` on `departments` (deletion = `active = false`);
  admin insert/update stays under the existing `departments_admin` policy.
- `private.handle_new_user()` rejects a signup whose department is missing or
  hidden (`P0001` `'اللجنة غير متاحة'`).

**Public pages** render active departments by `sort_order` from `siteContent()`,
replacing the static markup; if loading fails, the static six stay:
- homepage cards (image, or the Font Awesome icon when `image` is empty; name;
  description; link `departments.html#<slug>-dept`),
- `departments.html` sections (alternating light/dark styles, `page_title`,
  `details`, tasks list, id `<slug>-dept`); the hash filter moves to `main.js`
  and shows every section when the hash matches none,
- `structure.html` cards (icon, `display_name`, titles, names, `غير محدد`),
- `register.html` committee cards; selecting one stores its slug on
  `#committeeQuestionTitle` (`data-slug`) and shows its questions — the six keep
  their current sets (now keyed by slug), others get the standard set:
  experience level (radio), skills (textarea), why join (textarea, required),
  link to past work (text, optional).
- Static anchors for «المتابعة والتطوير» change from `followup-dept` to `quality-dept`.

**Dashboard («الهيكل التنظيمي»):** each department row edits name, structure
title, page title, short description, details, tasks, icon (select from a fixed
list), leader/deputy and titles; **«حذف القسم»** (confirm) hides it. Hidden
departments are listed below with **«إظهار»**. **«إضافة قسم جديد»** form (name,
structure title, short description, icon) appends it at the end
(`sort_order` = max + 1); details and leaders are filled in its row afterwards.

**API:** `saveDepartment(slug, fields)` accepts the new fields;
`addDepartment({ name, display_name, description, icon })`;
`setDepartmentActive(slug, active)`. `signUp` no longer checks a fixed slug list
(slug pattern only; the database decides).

## 3. Event attendees

**Database:** `event_registrations.phone text` (nullable for existing rows;
`^\+?[0-9]{8,15}$`). `register_for_event(uuid)` is replaced by
`register_for_event(p_event_id uuid, p_phone text)`: phone required
(`22023` `'رقم الجوال غير صحيح'`); re-registering updates the phone and returns
the same id. Reading stays as today: own rows, or admin.

**Events pages:** «سجل الآن» (signed in) opens an inline phone field and
«تأكيد التسجيل» / «إلغاء» in the card; the API normalises spaces and dashes and
validates (`'يرجى إدخال رقم جوال صحيح.'`). Signed-out visitors still go to login.

**Dashboard:** each event row gets **«المسجلون»**, opening a panel under the events
table: title, count, table (الاسم، البريد، الجوال، وقت التسجيل; missing phone «—»),
and **«تحميل Excel»** — a UTF-8 CSV with BOM named `attendees-<event date>.csv`.
Phone cells are written as `="<phone>"` so Excel keeps leading zeros; text cells
starting with `= + - @` are prefixed with `'` (formula injection).
API: `eventRegistrations(eventId)` → `[{ created_at, phone, profiles: { full_name, email } }]`.

## 4. Testing

- **Database:** phone required/validated/updated on re-register; admin reads
  attendee phone with name/email, a member reads only their own; admin adds and
  hides a department, nobody can delete one; members cannot add/edit departments;
  signup to a hidden department fails, to a new department succeeds.
- **Frontend:** header swaps when signed in and logout calls `signOut`; login page
  redirects when signed in; the four pages render a new department and omit a
  hidden one; the wizard submits a new department's slug with standard questions;
  event registration sends the typed phone and shows success only after it saves;
  dashboard adds/hides/restores a department and shows attendees and the CSV text.
- Existing tests that assumed static cards, fixed slugs or one-argument
  registration are updated to the new behaviour.

## 5. Rollout

Owner runs `202610080003_departments_attendees.sql` once (copied to clipboard, page
opened for them); verify via REST; merge, push, watch the deploy, check live pages.
