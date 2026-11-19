# AlGloryThM Community Platform

A full-stack, database-driven technology-community platform for AlGloryThM. It pairs an ambitious public site with one secure, centralized organization CMS and administration panel.

> **Brand asset:** the supplied AlGloryThM logo is included at `public/images/aiglorythm-logo.jpeg` and is configured as the initial logo and favicon. It can be replaced through **Admin → Global settings** and the Media Library.

## What is included

### Public experience
- Responsive dark-first website with optional local light mode.
- Home, About, Opportunities, Events, individual opportunity/event pages, Join Us, Team, Partners, and Contact pages.
- Database-driven home/About sections; no public copy needs a code change.
- Opportunity search, category/deadline filtering, detail pages, sharing, authenticated bookmarks, and external application links.
- Event detail pages with schedules/speakers, capacity/deadline checks, duplicate-safe registrations, and confirmation records.
- Membership, contact, and partnership forms with server-side validation and honeypot spam protection.
- Member account dashboard: profile, bookmarks, registrations, application state, and in-app notifications.
- Metadata, Open Graph/Twitter cards, canonical base URL support, sitemap, robots file, responsive layouts, 404, and error boundary.

### Centralized Admin Panel
Visit `/admin` as an administrator. One sidebar controls:

1. Overview
2. Website editor (with published live preview)
3. Pages management
4. Events management + attendee list/export
5. Opportunities management
6. Membership management + status/notes/export
7. Team management
8. Partners & sponsors
9. Testimonials
10. Announcements
11. Media library
12. Contact & inquiries
13. User management
14. Notifications
15. SEO management
16. Global settings

Administrators can create, edit, publish, archive, delete, reorder, show/hide and export records without accessing code or the database. Every change writes to the relational database and is visible on refresh. Page sections support arbitrary new sections and order controls; published pages obtain their editable section content from `page_sections`.

The schema records a revision snapshot (`content_versions`) for each CMS update. This provides an audit/revision base and can be surfaced or restored in a future enhancement without touching the public site.

### Authentication and authorization
- Bcrypt password hashing (never plaintext).
- Signed, HttpOnly, SameSite session cookie.
- Member, Admin, and Super Admin roles; protected server-side admin API routes.
- Sign-up, sign-in, sign-out, profile updates, development password-reset flow, and email verification tokens.
- Email reset/verification links are sent when Resend is configured. In development, a safe preview link is returned to make the workflow testable without external credentials.

## Stack

- **Next.js 15**, React 18, TypeScript
- Custom responsive design system (no remote runtime UI dependency)
- libSQL (SQLite-compatible) through the `libsql` driver, with foreign keys, WAL mode for local files, indexes, unique constraints, and idempotent migrations
- `bcryptjs`, `jose`, `zod`, `lucide-react`

### Database design

Schema bootstrap and idempotent migrations are in `app/lib/db.ts`. In local development the database file is `app/data/aiglorythm.db` (the legacy `data/aiglorythm.db` location is also detected). Set `DATABASE_PATH` to use a different local file. In production the same schema runs on a persistent libSQL/Turso database configured with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

Do not use the local SQLite file as production storage on Vercel: the deployment bundle is read-only and `/tmp` is ephemeral. The application refuses to start on Vercel without a persistent database instead of silently losing writes. Tables include:

`users`, `profiles`, `membership_applications`, `events`, `event_registrations`, `opportunities`, `bookmarks`, `team_members`, `partners`, `testimonials`, `announcements`, `media`, `inquiries`, `site_settings`, `page_sections`, `content_versions`, `notifications`, `password_reset_tokens`, and `email_verification_tokens`.

The schema includes foreign keys, duplicate guards (`event_id,email` and `user_id,opportunity_id`), indexes, and status workflows.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

On its first boot the app creates the local database and the initial Super Admin. No external database is required for local development.

| Field | Default development value |
|---|---|
| Admin email | `admin@aiglorythm.org` |
| Admin password | `AlGloryThM@2026!` |

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a long random `JWT_SECRET` **before the first production boot**. Change the bootstrap password immediately by using the password-reset flow after configuring email. Do not retain these defaults in production.

## Environment variables

Copy `.env.example`:

```env
JWT_SECRET=replace-with-a-long-random-secret-at-least-32-characters
ADMIN_EMAIL=admin@aiglorythm.org
ADMIN_PASSWORD=Change-this-immediately-2026!
NEXT_PUBLIC_SITE_URL=https://your-domain.example
# TURSO_DATABASE_URL=libsql://your-database.turso.io
# TURSO_AUTH_TOKEN=
# DATABASE_PATH=
RESEND_API_KEY=
EMAIL_FROM=AlGloryThM <hello@your-domain.example>
```

| Variable | Required | Purpose |
|---|---:|---|
| `JWT_SECRET` | Yes in production | Session signing key; use a long random value. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First run | Seeds initial Super Admin only when no user exists. |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical URLs and reset/verification links. |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Yes on Vercel | Persistent libSQL/Turso database. `LIBSQL_DATABASE_URL` / `LIBSQL_AUTH_TOKEN` are accepted as aliases. |
| `DATABASE_PATH` | Optional | Local development file override, or an absolute path on a persistent mounted volume for self-hosted Node. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Email delivery for verification/reset and admin notifications. In-app notifications continue without them. |

## Content workflow

1. Sign into `/admin`.
2. **Website editor**: edit section copy, buttons, images, visibility, publication state, and order. Use the live preview beneath the editor.
3. **Global settings**: change logo URL, favicon, brand identity, navigation JSON, theme accents, social links, contact fields, maintenance mode, and footer content.
4. **Media library**: upload a file and copy its permanent app URL into any content record.
5. **Events / Opportunities / Team / Partners**: create a record, choose **published**, then refresh the public page. Use the built-in CSV export controls for admin data.

All ordinary content changes are persisted immediately; no source edit or rebuild is needed.

## Production deployment

### Vercel (recommended for this repository)

Vercel does not provide persistent filesystem storage. The function bundle is read-only and `/tmp` is lost when an instance is recycled, so production data must live in a managed database. This application uses libSQL/Turso, which keeps the SQLite schema and queries unchanged.

1. Create a libSQL database with [Turso](https://turso.tech) (the free tier is sufficient to start).
2. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the Vercel project's environment variables for Production, Preview, and Development.
3. Add the remaining variables from `.env.example`, including a long random `JWT_SECRET` and a non-default `ADMIN_PASSWORD`.
4. Deploy. The first request creates the schema and seeds the initial administrator in the Turso database.
5. If you already have records in the local database, migrate them before the first production use (below).

The build works without database variables by using the repository's local database for build-time metadata. The production runtime requires a persistent database and reports a clear configuration error if one is missing.

### Self-hosted Node with a persistent volume

1. Create a Node 20+ service from this repository.
2. Attach a persistent disk/volume and set `DATABASE_PATH` to an absolute file path on that volume (for example `/var/lib/aiglorythm/aiglorythm.db`).
3. Set the remaining environment variables; use an HTTPS domain for `NEXT_PUBLIC_SITE_URL`.
4. Build command: `npm ci && npm run build`
5. Start command: `npm run start -- --hostname 0.0.0.0`
6. Configure Resend (optional but recommended) with a verified sender domain.
7. Back up the database file and `public/uploads/` on a scheduled basis.

### Migrating existing local records to Turso

The migration script reads the local database (including records still in the WAL) and copies the schema and rows into the configured target. It is idempotent and inserts only missing rows by default, so it cannot overwrite newer production data on a second run.

```bash
# Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to .env.local first.
npm run db:migrate:turso

# Force-overwrite existing target rows if you intentionally want the local copy to win.
node scripts/migrate-to-turso.mjs --replace
```

Use `TARGET_DATABASE_URL=file:./.tmp/test.db` to rehearse the migration against a local target without touching production.

### Media uploads

The Media Library writes to `public/uploads` on a local or self-hosted Node volume. On Vercel that directory is read-only, so configure object storage (for example Vercel Blob or S3) before using admin uploads in production. Text content, users, registrations, and admin records are unaffected because they are stored in Turso.

## Integrations that require credentials

- **Resend**: set `RESEND_API_KEY` and `EMAIL_FROM` to deliver account verification, password reset, and admin notification email.
- **Analytics**: paste an analytics identifier in Admin → Global settings. A provider-specific client snippet is intentionally not injected until the organization selects a provider and consent approach.
- **Managed database**: Turso/libSQL credentials are required for Vercel production. Configure `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

## Quality checks run

```bash
npm run build
```

Build completes successfully. The application was also smoke-tested for public routes, authentication, protected admin API authorization, contact submission, membership submission, and duplicate-safe event registration.

## Important operations notes

- Event banners, team photos, partner logos, and section imagery can be uploaded in Media Library and referenced by URL.
- Published testimonials are displayed only when a real administrator-created testimonial is approved; the seed intentionally contains no fabricated testimonials, partner claims, statistics, or awards.
- The app accepts JPG/PNG/WebP/GIF/PDF/MP4 media up to 10 MB. Production object storage is recommended for large or high-volume media.
- Admin APIs enforce an authenticated admin/super-admin session server-side; hiding UI alone is never relied upon.
