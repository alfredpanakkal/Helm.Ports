# Firebase Hosting — Helm.Ports

Static hosting setup for the Vite production build (`dist/`) on Firebase Hosting, project `gen-lang-client-0431355172`, site **`helmports`** (live at https://helmports.web.app).

## One-time setup

```bash
npm install -g firebase-tools   # install the CLI
firebase login                   # authorise the CLI in the browser
```

> `firebase init` is NOT needed — `firebase.json` and `.firebaserc` are already committed. Running it would only risk overwriting them.

## Deploy

```bash
npm run build                              # emits dist/ (vite build)
firebase deploy --only hosting:helmports   # or: npm run deploy:firebase
```

After deploying, the app is live at **https://helmports.web.app** (also https://helmports.firebaseapp.com).

- `firebase.json` — hosting config: site `helmports`, public dir `dist`, SPA rewrite to `/index.html`, long-cache hashed assets, no-cache `index.html`.
- `.firebaserc` — default project mapping for the CLI.

## API caveat

Firebase Hosting serves **static files only**. The Express API (`/api/ports`, `server.ts` / `api/index.ts`) is NOT hosted here — it runs on Vercel serverless. Options if the API must also move to Firebase:

1. Keep Vercel for the API and point the Firebase-hosted frontend at the Vercel API URL (current default — no action needed while the site stays on Vercel).
2. Add a `run` rewrite in `firebase.json` to a Cloud Run service hosting `server.ts` (requires containerising + a service with public ingress allowed for Firebase rewrites).

Until one of those is done, the Firebase-hosted build will render the UI but its `/api/**` requests will 404 unless rewritten to the Vercel deployment.

## CI deploy (optional, later)

Add a GitHub Action with `FirebaseExtended/action-hosting-deploy` and a `FIREBASE_SERVICE_ACCOUNT` secret (project settings → Service accounts → Generate new private key). Not enabled in this PR.
