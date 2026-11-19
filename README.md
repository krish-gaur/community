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
- `better-sqlite3` relational database with foreign keys, WAL mode, indexes, unique constraints, and idempotent migrations
- `bcryptjs`, `jose`, `zod`, `lucide-react`

### Database design

Schema bootstrap and idempotent migrations are in `app/lib/db.ts`; the database file is `data/aiglorythm.db` and is deliberately ignored by Git. Tables include:

`users`, `profiles`, `membership_applications`, `events`, `event_registrations`, `opportunities`, `bookmarks`, `team_members`, `partners`, `testimonials`, `announcements`, `media`, `inquiries`, `site_settings`, `page_sections`, `content_versions`, `notifications`, `password_reset_tokens`, and `email_verification_tokens`.

The schema includes foreign keys, duplicate guards (`event_id,email` and `user_id,opportunity_id`), indexes, and status workflows.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

On its first boot the app creates the database and the initial Super Admin.

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
RESEND_API_KEY=
EMAIL_FROM=AlGloryThM <hello@your-domain.example>
```

| Variable | Required | Purpose |
|---|---:|---|
| `JWT_SECRET` | Yes in production | Session signing key; use a long random value. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First run | Seeds initial Super Admin only when no user exists. |
| `NEXT_PUBLIC_SITE_URL` | Production | Canonical URLs and reset/verification links. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional | Email delivery for verification/reset and admin notifications. In-app notifications continue without them. |

## Content workflow

1. Sign into `/admin`.
2. **Website editor**: edit section copy, buttons, images, visibility, publication state, and order. Use the live preview beneath the editor.
3. **Global settings**: change logo URL, favicon, brand identity, navigation JSON, theme accents, social links, contact fields, maintenance mode, and footer content.
4. **Media library**: upload a file and copy its permanent app URL into any content record.
5. **Events / Opportunities / Team / Partners**: create a record, choose **published**, then refresh the public page. Use the built-in CSV export controls for admin data.

All ordinary content changes are persisted immediately; no source edit or rebuild is needed.

## Production deployment

This implementation uses a robust SQLite file for a fully functional zero-credential build. For production deploy it to a Node host with a **persistent writable volume**, such as Render, Railway, Fly.io, or a VPS:

1. Create a Node 20 service from this repository.
2. Attach a persistent disk/volume mounted at the app’s `data/` directory.
3. Set the environment variables above; use an HTTPS domain for `NEXT_PUBLIC_SITE_URL`.
4. Build command: `npm ci && npm run build`
5. Start command: `npm run start -- --hostname 0.0.0.0`
6. Configure Resend (optional but recommended) with a verified sender domain.
7. Back up `data/aiglorythm.db` and `public/uploads/` on a scheduled basis.

For an organization that requires horizontally scaled/serverless infrastructure, use a managed PostgreSQL adapter (for example Supabase Postgres/Neon) plus object storage. The current schema is normalized and portable; do not run the SQLite database on an ephemeral Vercel filesystem. For the supplied functional version, persistent Node hosting is the appropriate production target.

## Integrations that require credentials

- **Resend**: set `RESEND_API_KEY` and `EMAIL_FROM` to deliver account verification, password reset, and admin notification email.
- **Analytics**: paste an analytics identifier in Admin → Global settings. A provider-specific client snippet is intentionally not injected until the organization selects a provider and consent approach.
- **Managed database/storage (optional scale-out)**: Supabase, Neon, S3, or equivalent credentials are not fabricated; configure them for serverless/high-availability architecture.

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
