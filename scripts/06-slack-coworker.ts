import { App, LogLevel } from "@slack/bolt";
import { createCodexClient, defaultThreadOptions, timestamp, trimForLog } from "./helpers.js";
import type { ThreadItem } from "@openai/codex-sdk";

const REQUIRED_ENV = ["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"] as const;

function checkEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("See .env.example for setup instructions.");
    process.exit(1);
  }
}

function extractPromptFromMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

function formatItemsForSlack(items: ThreadItem[]): string {
  const parts: string[] = [];
  for (const item of items) {
    switch (item.type) {
      case "agent_message":
        parts.push(item.text);
        break;
      case "command_execution":
        parts.push(`\`\`\`\n$ ${item.command}\n(exit ${item.exit_code ?? "?"})\n\`\`\``);
        break;
      case "file_change":
        parts.push(
          `_File changes:_ ${item.changes.map((c) => `\`${c.kind} ${c.path}\``).join(", ")}`,
        );
        break;
    }
  }
  return parts.join("\n\n") || "_No response generated._";
}

async function main(): Promise<void> {
  checkEnv();

  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
    logLevel: LogLevel.INFO,
  });

  app.event("app_mention", async ({ event, say }) => {
    const prompt = extractPromptFromMention(event.text ?? "");
    if (!prompt) {
      await say({
        text: "Send me a prompt and I'll run it through Codex! Example: `@Codex Worker Analyze this repo's test coverage.`",
        thread_ts: event.ts,
      });
      return;
    }

    console.log(`[${timestamp()}] Mention from <@${event.user}> in <#${event.channel}>: ${trimForLog(prompt, 120)}`);

    await say({
      text: `:hourglass_flowing_sand: Working on it…`,
      thread_ts: event.ts,
    });

    try {
      const codex = createCodexClient();
      const thread = codex.startThread(
        defaultThreadOptions({
          sandboxMode: "read-only",
          approvalPolicy: "never",
          networkAccessEnabled: true,
        }),
      );

      const turn = await thread.run(prompt);
      const response = formatItemsForSlack(turn.items);

      const usageInfo = turn.usage
        ? `\n_Tokens: in=${turn.usage.input_tokens} cached=${turn.usage.cached_input_tokens} out=${turn.usage.output_tokens}_`
        : "";

      const MAX_SLACK_MSG = 3900;
      const body = response.length > MAX_SLACK_MSG
        ? `${response.slice(0, MAX_SLACK_MSG)}…\n\n_(truncated — full response was ${response.length} chars)_`
        : response;

      await say({
        text: `${body}${usageInfo}`,
        thread_ts: event.ts,
      });

      console.log(`[${timestamp()}] Replied (thread=${thread.id ?? "?"})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${timestamp()}] Error: ${message}`);
      await say({
        text: `:x: Codex error: ${message}`,
        thread_ts: event.ts,
      });
    }
  });

  app.message(async ({ message, say }) => {
    if (message.subtype || !("text" in message)) return;

    const isDM = message.channel_type === "im";
    if (!isDM) return;

    const prompt = message.text?.trim();
    if (!prompt) return;

    console.log(`[${timestamp()}] DM from <@${message.user}>: ${trimForLog(prompt, 120)}`);

    try {
      const codex = createCodexClient();
      const thread = codex.startThread(
        defaultThreadOptions({
          sandboxMode: "read-only",
          approvalPolicy: "never",
          networkAccessEnabled: true,
        }),
      );

      const turn = await thread.run(prompt);
      const response = formatItemsForSlack(turn.items);

      await say({ text: response, thread_ts: message.ts });
    } catch (error) {
      const message_ = error instanceof Error ? error.message : String(error);
      await say({ text: `:x: Codex error: ${message_}` });
    }
  });

  await app.start();
  console.log(`[${timestamp()}] Slack Codex coworker is running (Socket Mode)`);
  console.log("Listening for @mentions and DMs. Press Ctrl+C to stop.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Slack coworker failed: ${message}`);
  process.exit(1);
});
