# TheDeepSleepers

TheDeepSleepers is a responsive sleep and wind-down tracker for recording bedtimes, building a personal evening routine, and reviewing sleep habits over time. It features a moonlit interface, calendar history, bedtime insights, and optional Google sign-in with Supabase.

**Deployment URL:** [thedeepsleepers.netlify.app](https://thedeepsleepers.netlify.app/)

## Features

- Log an evening date, bedtime, and wind-down completion.
- Create and manage a personal checklist; press **Enter** or select **Add** to add a step.
- Review and manage entries in a calendar with touch-friendly date actions.
- Explore bedtime and routine-completion trends by day, week, month, or year.
- Use the app locally without an account, or optionally sync account data through Supabase.
- Switch between light and dark themes and use the responsive mobile navigation.

## Technology

- React and TypeScript
- Vite
- Recharts, Lucide React, and Framer Motion
- Supabase JS for optional authentication and database access
- Netlify for hosting and GitHub Actions for continuous integration

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Local development

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173` by default. To check changes before publishing:

```bash
npm run lint
npm run build
```

The production build is written to `dist/`.

## Data and account behavior

Without Supabase configuration, app data is stored in the current browser's local storage. It does not sync between browsers or devices.

When you sign in, existing local data is preserved on the device. If the account already has cloud records, the app displays those records while keeping the local backup separate. If the account has no cloud records, your local data remains visible and you can either import it to the account or choose to start using cloud storage. Data is not silently deleted or automatically merged. Signing out restores the saved local data on that device.

## Enable Google sign-in and Supabase sync

Authentication is optional. To enable it for local development and the hosted site:

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in the project's SQL Editor. The schema enables row-level security for user-owned data.
2. In Google Cloud Console, create an OAuth 2.0 web client. Add the site origin `https://thedeepsleepers.netlify.app` and, for local development, `http://localhost:5173` to **Authorized JavaScript origins**. Add the Supabase Google callback URL (shown in Supabase; typically `https://<project-ref>.supabase.co/auth/v1/callback`) to **Authorized redirect URIs**.
3. In Supabase, enable Google under **Authentication → Providers** and enter the Google client ID and client secret. Under **Authentication → URL Configuration**, set the site URL and allow the hosted URL and `http://localhost:5173` as redirect URLs.
4. Set the following environment variables for local development in a `.env` file, or configure them in Netlify's environment settings before deployment:

   ```text
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<project-anon-or-publishable-key>
   ```

   `.env.example` contains placeholders. Restart the local Vite server after changing environment variables. Changes to Netlify environment variables require a new deploy.

Only the Supabase project URL and browser-safe anon/publishable key belong in the client environment. **Never expose a Supabase service-role key or Google OAuth client secret in frontend code or `VITE_` variables.**

Until Supabase variables are included in the deployed build, Settings still shows the Google sign-in option, but sign-in will report that the build is not configured. Configure the variables and deploy again to activate OAuth.

## Deployment

The repository includes `netlify.toml` with the Vite build command, `dist` publish directory, and SPA fallback routing. Connect the repository to Netlify, add the Supabase environment variables if using cloud features, and deploy.

GitHub Actions in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs dependency installation, linting, and the production build on pushes and pull requests.

## Project layout

```text
src/                  React application, styles, and Supabase client
public/               Static assets and app branding
supabase/schema.sql   Database tables, indexes, and row-level security
.github/workflows/    Continuous-integration workflow
netlify.toml          Netlify build and SPA routing configuration
```

## Privacy note

Sleep and routine information is personal data. Local data is stored in the browser profile. When cloud sync is enabled, records are sent to the configured Supabase project under the signed-in user's account and protected by the included row-level security policies. This app is a personal tracker, not medical advice or a clinical sleep assessment.
