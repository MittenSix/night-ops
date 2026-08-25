# Night Ops Training

Night Ops is a mobile-friendly outdoor-skills training app with public previews, member accounts, synchronized progress, and lead-only troop tools. The production site is [night-ops.training](https://night-ops.training/).

## Local development

Requirements: Node.js 22 and pnpm 11.

```sh
pnpm install
pnpm dev
```

Run unit tests and a production build with `pnpm run check`. Run the Playwright browser and accessibility suite with `pnpm run test:e2e`.

## Architecture

- `src/core/routes.js` is the route registry and access policy.
- `src/core/router.js` owns URL history, authentication redirects, titles, and intended destinations.
- `src/core/store.js` owns versioned training state, migrations, immutable updates, and conflict merging.
- `backend.js` connects the browser to Supabase Auth and Postgres.
- `supabase/schema.sql` is the canonical database schema and RLS policy reference.
- `supabase/migrations/` and `supabase/tests/` make the database reproducible and test its authorization boundaries in CI.
- `sw.js` provides a small same-origin offline cache; API requests and account credentials are never cached.

## Security and accounts

The browser contains only the Supabase publishable key. Row Level Security limits members to their own profile and progress, while leads can manage shared schedules and announcements. Privileged account deletion and role changes run in the deployed `account-admin` Edge Function, which requires a valid user session and checks lead status server-side.

The first lead must be assigned by the repository/project owner in the Supabase dashboard. After that, a lead can manage member roles from **Night Ops leads → Member access**. Never place a Supabase secret key or service-role key in this repository.

Members can reset their password, download their data, update their display name, and permanently delete their account from **Account**.

## Deployment

Pushing `main` triggers GitHub Pages and the Quality workflow. The custom domain is declared in `CNAME`. Supabase schema and Edge Function changes are intentionally deployed separately so database mutations require an authenticated project owner.

Before a release, confirm:

1. `pnpm run check` passes.
2. Browser and database-security jobs are green in GitHub Actions.
3. Public landing, preview, login, password recovery, and browser back navigation work on production.
4. Signed-in progress sync and lead-only controls work with test accounts.
