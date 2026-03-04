import { argv } from "node:process";

import { createCodexClient, defaultThreadOptions, timestamp } from "./helpers.js";
import type { ThreadItem } from "@openai/codex-sdk";

const DEFAULT_REPO = "rudrankriyam/Foundation-Models-Framework-Example";

const USAGE = `Usage: npm run demo:pr-review -- [owner/repo] <pr-number>
Examples:
  npm run demo:pr-review -- 42
  npm run demo:pr-review -- rudrankriyam/Foundation-Models-Framework-Example 42`;

function formatItemSummary(item: ThreadItem): string | null {
  switch (item.type) {
    case "agent_message":
      return `Assistant: ${item.text.slice(0, 200)}${item.text.length > 200 ? "..." : ""}`;
    case "command_execution":
      return `Command: ${item.command} (${item.status}, exit ${item.exit_code ?? "?"})`;
    case "file_change":
      return `File change: ${item.changes.map((c) => `${c.kind} ${c.path}`).join(", ")}`;
    default:
      return null;
  }
}

function parseArgs(args: string[]): { repo: string; prNumber: string } {
  if (args.length === 0) {
    console.error(USAGE);
    process.exit(1);
  }

  if (args.length === 1) {
    return { repo: process.env.PR_REVIEW_REPO ?? DEFAULT_REPO, prNumber: args[0] };
  }

  return { repo: args[0], prNumber: args[1] };
}

async function main(): Promise<void> {
  const { repo, prNumber } = parseArgs(argv.slice(2));

  const prompt = [
    `You are a senior AI code reviewer. Review pull request #${prNumber} on GitHub repository ${repo}.`,
    "",
    "Steps:",
    `1. Run: gh pr diff ${prNumber} --repo ${repo}`,
    `2. Run: gh pr view ${prNumber} --repo ${repo} --json title,body,labels,files`,
    "3. Analyze the diff for:",
    "   - Correctness and logic errors",
    "   - Security concerns (secrets, injection, unsafe APIs)",
    "   - Performance regressions",
    "   - Swift/TypeScript best practices and maintainability",
    "   - Missing error handling or edge cases",
    "4. Format your review as a markdown comment with:",
    "   - **Verdict**: approve / request changes",
    "   - **Summary**: one paragraph overview",
    "   - **Findings**: bullet list with file:line references",
    "   - **Suggestions**: optional improvements",
    "   - **Confidence**: score 0-1",
    `5. Post your review: gh pr comment ${prNumber} --repo ${repo} --body "<your review>"`,
    "",
    "Be concise and actionable. Execute all steps without asking for approval.",
  ].join("\n");

  const codex = createCodexClient();
  const thread = codex.startThread(
    defaultThreadOptions({
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: true,
    }),
  );

  console.log(`[${timestamp()}] Reviewing PR #${prNumber} on ${repo}...`);
  console.log(`Thread options: sandbox=workspace-write, approval=never, network=true\n`);

  const { events } = await thread.runStreamed(prompt);

  for await (const event of events) {
    switch (event.type) {
      case "item.completed": {
        const summary = formatItemSummary(event.item);
        if (summary) {
          console.log(`  ${summary}`);
        }
        break;
      }
      case "turn.completed":
        console.log(
          `\nUsage: input=${event.usage.input_tokens}, cached=${event.usage.cached_input_tokens}, output=${event.usage.output_tokens}`,
        );
        break;
      case "turn.failed":
        console.error(`\nTurn failed: ${event.error.message}`);
        break;
    }
  }

  console.log(`\n=== PR REVIEW COMPLETE ===`);
  console.log(`Thread ID: ${thread.id ?? "unavailable"}`);
  console.log(`Check PR #${prNumber} on GitHub for the posted comment.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PR reviewer failed: ${message}`);
  process.exit(1);
});
