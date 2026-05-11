import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const drizzleVersion = pkg.dependencies["drizzle-orm"].replace("^", "");
const pgVersion = pkg.dependencies["pg"].replace("^", "");

execFileSync("npm", ["init", "-y"], { stdio: "inherit" });
execFileSync(
  "npm",
  ["install", "--save-exact", `drizzle-orm@${drizzleVersion}`, `pg@${pgVersion}`],
  { stdio: "inherit" },
);
