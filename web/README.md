# Web (Next.js + TypeScript + Tailwind)

- Next.js 14, React 18, Tailwind preconfigured
- Firebase client SDK for email/password auth
- Axios with auth interceptor (adds `Authorization: Bearer <token>` to API calls)

## Pages
- `/` – Landing (redirects to `/projects` if logged in)
- `/login` – Email/password sign in
- `/signup` – Email/password sign up
- `/projects` – Table view with tabs (**My Projects** and **Recommended**)
- `/projects/new` – Create a project form
- `/projects/[id]` – Project view/details

## Components
- `components/Layout.tsx` – Top nav + container
- `components/AuthedOnly.tsx` – Redirects to `/login` if not authenticated

## Auth utilities
- `utils/firebase.ts` – initializes Firebase from `NEXT_PUBLIC_FIREBASE_CONFIG_JSON`
- `utils/auth.tsx` – React context with `user`, `token`, `loading`
- `utils/api.ts` – Axios instance bound to `NEXT_PUBLIC_API_BASE`

## Styling
- Tailwind is enabled; global styles in `styles/globals.css`
- Simple dark theme tokens and helper classes (`.container`, `.card`, `.input`, `.btn`, `.table`)

## Dev tips
- Update `NEXT_PUBLIC_API_BASE` in `.env` if your API runs elsewhere
- Wrap new protected pages with `AuthedOnly`


## Environment
Place frontend vars in `web/.env.local` (see `.env.local.sample`).
