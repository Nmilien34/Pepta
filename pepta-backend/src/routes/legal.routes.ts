import { Router } from "express";

export function createLegalRouter(): Router {
  const router = Router();

  router.get("/terms", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Pepta Terms</title></head>
  <body>
    <main>
      <h1>Pepta Terms</h1>
      <p>Pepta is a wellness tracking app. It does not provide medical advice.</p>
      <p>Use Pepta to track your own logs, nutrition, medication schedule, and progress data.</p>
    </main>
  </body>
</html>`);
  });

  router.get("/privacy", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Pepta Privacy</title></head>
  <body>
    <main>
      <h1>Pepta Privacy</h1>
      <p>Pepta stores account, onboarding, log, progress-photo, and meal-scan data to power the app.</p>
      <p>Photos are stored in private object storage and accessed through short-lived signed URLs.</p>
    </main>
  </body>
</html>`);
  });

  return router;
}
