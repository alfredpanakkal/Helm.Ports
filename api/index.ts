import { buildApiApp } from "../src/lib/apiApp.ts";

/**
 * Vercel serverless entry point.
 *
 * Exposes the same JSON API as server.ts without the static-file serving,
 * Vite middleware, or listener - those are handled by the platform.
 * vercel.json rewrites all /api/* requests here and bundles the dataset
 * via functions["api/index.ts"].includeFiles so the in-memory cache in
 * src/lib/ports.ts can read it at runtime.
 *
 * Boot and async failures are logged with a greppable [API] prefix:
 * Express 4 does not catch rejected promises from async handlers, and an
 * unhandled rejection otherwise kills the process with nothing but an
 * opaque FUNCTION_INVOCATION_FAILED. These handlers keep the process
 * alive and put the real stack trace in the function logs.
 */
process.on("uncaughtException", (err) => {
  console.error("[API] uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[API] unhandled rejection:", reason);
});

console.log("[API] module loaded, building app");

export default buildApiApp();
