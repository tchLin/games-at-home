import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Check tracked source only. Firebase browser keys are necessarily visible in
// built assets, but live values must not be committed to source control.
const patterns = [
  /AIza[0-9A-Za-z_-]{35}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[0-9A-Za-z]{30,}/,
  /github_pat_[0-9A-Za-z_]{40,}/,
  /"type"\s*:\s*"service_account"/,
];
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const flagged = paths.filter((path) => {
  try {
    const value = readFileSync(path, "utf8");
    return patterns.some((pattern) => pattern.test(value));
  } catch {
    return false;
  }
});
if (flagged.length) {
  console.error(
    "Possible credentials found in tracked source:\n" + flagged.join("\n"),
  );
  process.exit(1);
}
console.log(
  "Tracked source check passed: no recognized live keys or private credentials.",
);
