import path from "path";
import { fileURLToPath } from "url";
import express, { Request, Response } from "express";
import { buildApiApp } from "./src/lib/apiApp.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // JSON API — shared with the Vercel serverless entry point (api/index.ts)
  app.use(buildApiApp());

  // Client serving: Vite dev server or production static files
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, "dist", "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Helm.Ports server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
