/**
 * Reports Svelte markup strings that are still English.
 *
 * The report uses the same parser pass as the build preprocessor
 * (`collectMarkupMessages`), so everything listed as missing is exactly what the
 * app will render in English. Add those strings to `zh-CN.js` and
 * `packages/core/src/gb-i18n-zh-CN.ts` to translate them.
 *
 * Usage:
 *   node scripts/i18n/scan.mjs            # human-readable report, shipped code only
 *   node scripts/i18n/scan.mjs --all      # include stories and test components
 *   node scripts/i18n/scan.mjs --json     # machine-readable report
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectMarkupMessages } from "./preprocessor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE_DIRS = ["apps/desktop/src", "packages/ui-svelte/src", "packages/shared/src"];
// Stories and the fixture components under `components/test` never ship.
const EXCLUDED = [/[\\/]stories[\\/]/, /\.stories\.svelte$/, /[\\/]components[\\/]test[\\/]/];

const options = new Set(process.argv.slice(2));
const includeAll = options.has("--all");
const asJson = options.has("--json");

function walk(dir, files) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(file, files);
		else if (entry.name.endsWith(".svelte")) files.push(file);
	}
}

const files = [];
for (const dir of SOURCE_DIRS) walk(path.join(ROOT, dir), files);

const add = (map, message, file) => {
	const entry = map.get(message) || { count: 0, files: new Set() };
	entry.count++;
	entry.files.add(path.relative(ROOT, file));
	map.set(message, entry);
};

const translated = new Map();
const missing = new Map();
let scanned = 0;
let handLocalized = 0;
let unparseable = 0;

for (const file of files) {
	if (!includeAll && EXCLUDED.some((pattern) => pattern.test(file))) continue;
	const collected = collectMarkupMessages(fs.readFileSync(file, "utf8"), file);
	if (!collected) {
		unparseable++;
		continue;
	}
	if (collected.handLocalized) {
		handLocalized++;
		continue;
	}
	scanned++;
	for (const run of collected.runs) {
		if (run.kind === "expression") continue;
		add(run.kind === "translated" ? translated : missing, run.message, file);
	}
}

const toReport = (map) =>
	[...map.entries()]
		.map(([message, entry]) => ({ message, count: entry.count, files: [...entry.files].sort() }))
		.sort((a, b) => b.count - a.count || a.message.localeCompare(b.message));

if (asJson) {
	console.log(
		JSON.stringify(
			{
				scanned,
				handLocalized,
				unparseable,
				translated: toReport(translated),
				missing: toReport(missing),
			},
			null,
			2,
		),
	);
	process.exit(0);
}

const translatedRuns = [...translated.values()].reduce((sum, entry) => sum + entry.count, 0);
console.log(
	`svelte files scanned: ${scanned} (skipped ${handLocalized} hand-localized, ${unparseable} unparseable)`,
);
console.log(`translated runs: ${translatedRuns} (${translated.size} distinct messages)`);

const rows = toReport(missing);
console.log(`missing runs: ${rows.length} distinct messages`);
if (!rows.length) process.exit(0);

console.log("");
console.log("count\tsource string\tfiles");
for (const row of rows) {
	const files = row.files.slice(0, 2).join(", ");
	const more = row.files.length > 2 ? ` (+${row.files.length - 2})` : "";
	console.log(`${row.count}\t${JSON.stringify(row.message)}\t${files}${more}`);
}
