import express from "express";
import { config } from "./config.js";
import { granolaWebhookRouter } from "./granola/webhook.js";

export const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "meeting-knowledge-system" });
});

app.use("/webhooks", granolaWebhookRouter);

export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`[server] listening on port ${config.port}`);
  });
}
