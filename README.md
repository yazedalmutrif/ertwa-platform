# Ertwa Digital Platform

An Arabic technical community website under Taqat Certified Training Institute,
built with HTML, CSS, vanilla JavaScript, and Supabase.

## Run locally

```sh
python3 -m http.server 5500 --bind 127.0.0.1
```

Open `http://localhost:5500`. Follow [Supabase setup](SUPABASE_SETUP.md) to create
the database (two SQL files), add the public connection values, and promote your
first admin account.
Authentication and data submissions require that setup.

## Features

- Email/password signup, email confirmation, login, and logout with Supabase Auth.
- Committee application wizard that stores personal data and questionnaire answers.
- Public events with persistent registration, duplicate prevention, and seat limits.
- Member dashboard showing actual membership status, registrations, requests, and approved hours.
- Admin dashboard for adding, editing and hiding events, applications, service requests,
  contribution approvals, and making members admins.
- Admin editing of the structure page (leaders, deputies, titles) and homepage content
  (intro, mission, vision, department descriptions, statistics).
- Guest digital service requests, each emailed to the owner through FormSubmit.
- Database-enforced access controls and Arabic feedback for failed operations.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `departments.html`, `events.html`, `structure.html` | Public pages |
| `login.html`, `register.html`, `dashboard.html`, `order.html` | Account, admin, and service flows |
| `supabase-config.js` | Project URL, public browser key, and request notification email |
| `api.js` | Supabase authentication, queries, and mutation API |
| `main.js` | Page integration and member dashboard |
| `admin.js` | Admin dashboard: events, reviews, members and roles |
| `admin-content.js` | Admin editors for the structure page and homepage content |
| `script.js` | Visual effects and committee wizard |
| `supabase/migrations/` | Database schema, triggers, functions, grants, and RLS |
| `tests/` | PostgreSQL permissions and frontend behavior tests |
| `style.css`, `register.css`, `images/` | Website design and assets |

## Tests

```sh
npm ci
npm test
```

Node.js 20+ is needed for tests only. The website itself needs no build step.

## Publish on GitHub Pages

The repository includes a GitHub Pages workflow. In the repository's
**Settings → Pages**, select **GitHub Actions** as the publishing source.
Push to `main` or run **Publish website to GitHub Pages** from the Actions tab.
The workflow checks the database and forms, builds the public website, and
publishes it at the URL shown by the deployment.

Only HTML, JavaScript, CSS, and images are deployed. The build leaves SQL,
tests, documentation, and dependencies out of the website artifact.

```sh
npm run build
```

This creates `_site/`, which is ignored by Git. See GitHub's
[Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for publishing details. After deployment, add the site's `dashboard.html` URL
to the allowed redirects in Supabase Authentication.
