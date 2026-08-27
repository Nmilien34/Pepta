// Is this process pointed at production data?
//
// NODE_ENV answers a different question. It is a LABEL somebody has to
// remember to set, and on 2026-08-27 the Render deploy booted without it:
//
//   {"port":8080,"env":"development","msg":"[server] Pepta API listening"}
//
// Serving real users, off the production database, calling itself development.
// Every safeguard keyed to that label went silently inert — the production
// env-var guards, the log level, and worst of all confirmProductionMutation(),
// which opens with `if (!env.isProduction) return` and therefore waved
// destructive admin writes straight through.
//
// So this asks the question from EVIDENCE instead. A Mongo URI that is not
// local means this process can reach production data, whatever the label says.
// It cannot be forgotten, because it is derived from the connection you are
// actually using.
//
// Deliberately separate from config/env.ts so scripts and tests can import it
// without pulling in the whole validated env (which runs dotenv and exits the
// process on a bad config).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/**
 * True when `mongoUri` points somewhere other than this machine.
 *
 * FAILS SAFE. An empty or unparseable URI returns true — "I could not tell"
 * must mean "assume production", because the alternative is a destructive
 * admin script deciding it is safe to skip its confirmation.
 */
export function looksDeployed(mongoUri: string | undefined | null): boolean {
  if (!mongoUri) return true;

  // mongodb:// and mongodb+srv:// are not parseable by URL in every runtime,
  // so pull the host section out by hand: everything between the scheme (and
  // optional credentials) and the next / or ?.
  const withoutScheme = mongoUri.replace(/^mongodb(\+srv)?:\/\//i, "");
  if (withoutScheme === mongoUri) return true; // no recognisable scheme

  const afterCredentials = withoutScheme.includes("@")
    ? withoutScheme.slice(withoutScheme.lastIndexOf("@") + 1)
    : withoutScheme;

  const hostSection = afterCredentials.split(/[/?]/)[0] ?? "";
  if (!hostSection) return true;

  // A seed list can name several hosts; local only if EVERY one is local.
  const hosts = hostSection.split(",").map((entry) => {
    const trimmed = entry.trim();
    // Strip a port, but not from a bracketed IPv6 literal.
    if (trimmed.startsWith("[")) return trimmed.slice(0, trimmed.indexOf("]") + 1);
    const colon = trimmed.lastIndexOf(":");
    return colon === -1 ? trimmed : trimmed.slice(0, colon);
  });

  if (hosts.some((host) => host === "")) return true;
  return !hosts.every((host) => LOCAL_HOSTS.has(host.toLowerCase()));
}
