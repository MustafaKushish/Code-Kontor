// Legt die Plattform-Datenbank (Cloudflare D1) beim ersten Veröffentlichen an
// und trägt ihre ID in wrangler.jsonc ein. Läuft in GitHub Actions.
// Die Datenbank liegt nur in EU-Rechenzentren (Jurisdiktion „eu“).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAME = "code-kontor-platform-eu";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
// Wrangler schreibt manchmal Hinweise vor die JSON-Liste, deshalb nur den Teil von [ bis ] lesen.
const list = () => {
  const out = wrangler("d1", "list", "--json");
  return JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1));
};
const find = () => list().find((db) => db.name === NAME);

let db = find();
if (!db) {
  console.log(`Lege Datenbank ${NAME} an …`);
  wrangler("d1", "create", NAME, "--jurisdiction", "eu");
  db = find();
}
if (!db?.uuid) throw new Error(`Datenbank ${NAME} nicht gefunden`);

const config = readFileSync("wrangler.jsonc", "utf8");
writeFileSync("wrangler.jsonc", config.replace(/"database_id": "[^"]*"/, `"database_id": "${db.uuid}"`));
console.log(`Datenbank ${NAME}: ${db.uuid}`);
