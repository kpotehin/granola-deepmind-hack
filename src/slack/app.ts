import { App, LogLevel } from "@slack/bolt";
import { config } from "../config.js";

let slackApp: App | null = null;

export function getSlackApp(): App | null {
  return slackApp;
}

export function initSlackApp(): App {
  if (slackApp) return slackApp;

  slackApp = new App({
    token: config.slack.botToken,
    appToken: config.slack.appToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  return slackApp;
}

export async function startSlackApp(): Promise<void> {
  if (!slackApp) throw new Error("Slack app not initialized");
  await slackApp.start();
  console.log("[slack] Bolt app running (Socket Mode)");
}
