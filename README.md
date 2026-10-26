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
