// Legt die Plattform-Datenbank (Cloudflare D1) beim ersten Veröffentlichen an
// und trägt ihre ID in wrangler.jsonc ein. Läuft in GitHub Actions.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const NAME = "code-kontor-platform";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const find = () => JSON.parse(wrangler("d1", "list", "--json")).find((db) => db.name === NAME);

let db = find();
if (!db) {
  console.log(`Lege Datenbank ${NAME} an …`);
  wrangler("d1", "create", NAME);
  db = find();
}
if (!db?.uuid) throw new Error(`Datenbank ${NAME} nicht gefunden`);

const config = readFileSync("wrangler.jsonc", "utf8");
writeFileSync("wrangler.jsonc", config.replace(/"database_id": "[^"]*"/, `"database_id": "${db.uuid}"`));
console.log(`Datenbank ${NAME}: ${db.uuid}`);
