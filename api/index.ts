import { buildApiApp } from "../src/lib/apiApp.ts";

/**
 * Vercel serverless entry point.
 *
 * Exposes the same JSON API as server.ts (GET /api/stats, /api/ports,
 * /api/ports/:id) without the static-file serving, Vite middleware, or
 * listener — those are handled by the platform on Vercel.
 *
 * vercel.json rewrites all /api/* requests here, and bundles the dataset
 * into the function via functions["api/index.ts"].includeFiles so the
 * in-memory cache in src/lib/ports.ts can read it at runtime.
 */
export default buildApiApp();
