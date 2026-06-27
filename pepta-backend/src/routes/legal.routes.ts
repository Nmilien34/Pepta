import path from "node:path";
import express, { type Request, type Response, type Router } from "express";

const LEGAL_DIR = path.resolve(process.cwd(), "public");

export function createLegalRouter(): Router {
  const router = express.Router();
  const sendPage = (file: string) => (_req: Request, res: Response) => {
    res.type("html").sendFile(path.join(LEGAL_DIR, file));
  };

  router.get("/terms", sendPage("terms.html"));
  router.get("/privacy", sendPage("privacy.html"));
  return router;
}
