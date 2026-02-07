import { App, LogLevel } from "@slack/bolt";
import { config } from "../config.js";

export const slackApp = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  logLevel: LogLevel.WARN,
});

export async function startSlackApp(): Promise<void> {
  await slackApp.start();
  console.log("[slack] Bolt app running (Socket Mode)");
}
