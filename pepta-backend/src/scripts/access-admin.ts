// Complimentary-access admin CLI. Thin adapter over the same domain service
// used by authentication — no separate logic path. Usage:
//
//   npm run access:invite  -- --email a@b.com --category creator --reason "Partnership" [--months 3] [--dry-run]
//   npm run access:list
//   npm run access:inspect -- --email a@b.com
//   npm run access:retry   -- --email a@b.com
//   npm run access:revoke  -- --email a@b.com [--dry-run]
//
// Mutations against a production database require CONFIRM_PRODUCTION=yes in
// the environment. Emails are masked in routine output. Secrets never print.

import os from "node:os";
import { connect, disconnect } from "../db/mongo";
import { env } from "../config/env";
import {
  createInvite,
  inspectInvite,
  listInvites,
  maskEmail,
  retryInvite,
  revokeInvite,
} from "../services/complimentary-access.service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireArg(name: string): string {
  const value = arg(name);
  if (!value) {
    console.error(`Missing required --${name}`);
    process.exit(1);
  }
  return value;
}

function confirmProductionMutation(action: string): void {
  if (!env.isProduction) return;
  if (process.env.CONFIRM_PRODUCTION === "yes") return;
  console.error(
    `Refusing to ${action} against PRODUCTION without CONFIRM_PRODUCTION=yes.`,
  );
  process.exit(1);
}

const operator = process.env.ACCESS_ADMIN_OPERATOR ?? os.userInfo().username;

async function main(): Promise<void> {
  const command = process.argv[2];
  await connect();

  switch (command) {
    case "invite": {
      const email = requireArg("email");
      const category = requireArg("category");
      if (category !== "creator" && category !== "friend") {
        console.error("--category must be creator or friend");
        process.exit(1);
      }
      const reason = requireArg("reason");
      const months = arg("months") ? Number(arg("months")) : undefined;
      if (hasFlag("dry-run")) {
        console.log(
          `[dry-run] would invite ${maskEmail(email)} (${category}, ${months ?? 3} months) — reason: ${reason}`,
        );
        break;
      }
      confirmProductionMutation("create an invitation");
      const result = await createInvite({
        email,
        category,
        reason,
        months,
        createdBy: operator,
      });
      console.log(
        result.alreadyExisted
          ? `Invitation already exists — status: ${result.status}`
          : `Invited ${maskEmail(email)} — status: ${result.status}${result.provisionedImmediately ? " (provisioned immediately: existing verified user)" : ""}`,
      );
      break;
    }
    case "list": {
      const rows = await listInvites();
      if (rows.length === 0) {
        console.log("No complimentary-access grants.");
        break;
      }
      for (const row of rows) {
        console.log(
          `${row.email.padEnd(28)} ${row.status.padEnd(18)} ${row.category.padEnd(8)} attempts=${row.attempts}${row.expiresAt ? ` expires=${row.expiresAt.toISOString()}` : ""}`,
        );
      }
      break;
    }
    case "inspect": {
      const detail = await inspectInvite(requireArg("email"));
      console.log(detail ? JSON.stringify(detail, null, 2) : "No grant for that email.");
      break;
    }
    case "retry": {
      confirmProductionMutation("retry a grant");
      const status = await retryInvite(requireArg("email"));
      console.log(`Grant status: ${status}`);
      break;
    }
    case "revoke": {
      const email = requireArg("email");
      if (hasFlag("dry-run")) {
        console.log(`[dry-run] would revoke ${maskEmail(email)}`);
        break;
      }
      confirmProductionMutation("revoke a grant");
      const status = await revokeInvite(email, operator);
      console.log(`Grant status: ${status}`);
      break;
    }
    default:
      console.error(
        "Usage: access-admin.ts <invite|list|inspect|retry|revoke> [--email ...] [--category creator|friend] [--reason ...] [--months N] [--dry-run]",
      );
      process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void disconnect());
