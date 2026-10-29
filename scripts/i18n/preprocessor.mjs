/**
 * GitButler 简体中文 - Svelte markup preprocessor.
 *
 * The upstream app hard-codes English UI text. This preprocessor rewrites
 * translatable markup runs into `__gb_t(...)` calls, where the key is the
 * whitespace-normalized English source text and the catalog lives in
 * `packages/core/src/gb-i18n-zh-CN.ts`.
 *
 * It mirrors the original 0.22.3 localization layer recovered from the build
 * maps:
 *   - text nodes and `{expression}` tags in markup are wrapped;
 *   - mixed text/expression runs become `{__gb_t("Text {0}", [expr])}` only
 *     when the normalized message exists in the catalog (so user content such
 *     as commit messages is not accidentally translated);
 *   - a single expression is wrapped unconditionally (`{__gb_t(expr)}`);
 *   - literal `alt`, `aria-label`, `label`, `placeholder` and `title`
 *     attributes become expressions when the catalog has their value;
 *   - `<pre>`, `<code>` and `<textarea>` are left untouched;
 *   - files that already carry `__gb_t` are considered hand-localized and are
 *     not rewritten again.
 *
 * Usage in a svelte.config.js:
 *   import { gbI18nPreprocessor } from "../../scripts/i18n/preprocessor.mjs";
 *   preprocess: [gbI18nPreprocessor(), vitePreprocess(...)]
 */
import { parse } from "svelte/compiler";
import { zhCN } from "./zh-CN.js";

const KEYS = new Set(Object.keys(zhCN));
const SKIP_ELEMENTS = new Set(["pre", "code", "textarea"]);
// Attribute values that are shown to users (tooltips, placeholders, labels and
// accessibility text). Only literal values with a catalog entry are rewritten;
// example values such as token placeholders therefore stay untouched.
const TRANSLATABLE_ATTRIBUTES = new Set(["alt", "aria-label", "label", "placeholder", "title"]);
const IMPORT_LINE = 'import { t as __gb_t } from "@gitbutler/core/gb-i18n";';

const norm = (value) =>
	String(value || "")
		.replace(/\s+/g, " ")
		.trim();
const isText = (node) => node && node.type === "Text";
const isExpr = (node) => node && (node.type === "ExpressionTag" || node.type === "MustacheTag");

function expressionSource(content, node) {
	const expr = node.expression;
	if (expr && typeof expr.start === "number" && typeof expr.end === "number") {
		return content.slice(expr.start, expr.end);
	}
	return content.slice(node.start + 1, node.end - 1);
}

function addImport(content, changes) {
	if (content.includes("@gitbutler/core/gb-i18n")) return;
	const scripts = [...content.matchAll(/<script\b[^>]*>/g)];
	const instance = scripts.find((m) => !/context\s*=\s*["']module["']/.test(m[0]));
	if (instance) {
		const at = instance.index + instance[0].length;
		changes.push({ start: at, end: at, text: "\n\t" + IMPORT_LINE });
	} else {
		// A module-only script doesn't expose imports to the markup; add an instance script.
		changes.push({ start: 0, end: 0, text: `<script lang="ts">\n\t${IMPORT_LINE}\n</script>\n` });
	}
}

function applyChanges(content, changes) {
	changes.sort((a, b) => b.start - a.start || b.end - a.end);
	let out = content;
	for (const c of changes) out = out.slice(0, c.start) + c.text + out.slice(c.end);
	return out;
}

/**
 * Collects the markup runs a translation pass would consider, without changing
 * the file. Shared by the preprocessor and `scripts/i18n/scan.mjs` so the
 * coverage report and the build agree on what is translatable.
 *
 * Returns `null` for non-Svelte or unparseable files, `{ handLocalized: true }`
 * for files that already reference `__gb_t`, and otherwise the runs with one of
 * three kinds:
 *   - `expression`: a lone `{expr}` tag, always wrapped (`__gb_t(expr)`);
 *   - `translated`: a text/mixed run whose message is in the catalog;
 *   - `missing`: a text/mixed run whose message is not in the catalog.
 */
export function collectMarkupMessages(content, filename) {
	if (!/\.svelte$/.test(filename)) return null;
	// Already localized by hand (the language settings card ships with the
	// catalog import). Avoid wrapping its `__gb_t(...)` calls a second time.
	if (content.includes("__gb_t")) return { handLocalized: true, runs: [] };

	let ast;
	try {
		ast = parse(content, { modern: true });
	} catch (error) {
		console.warn("[gb-i18n] parse failed, leaving file untouched:", filename, error.message);
		return null;
	}

	const runs = [];
	const seen = new Set();

	const processChildren = (children) => {
		if (!Array.isArray(children) || !children.length) return;
		let i = 0;
		while (i < children.length) {
			const first = i;
			let hasRun = false;
			while (i < children.length && (isText(children[i]) || isExpr(children[i]))) {
				hasRun = true;
				i++;
			}
			if (hasRun) {
				const run = children.slice(first, i);
				const meaningful = run.some((n) => isExpr(n) || (isText(n) && n.data.trim().length > 0));
				if (meaningful) {
					let message = "";
					const values = [];
					for (const node of run) {
						if (isText(node)) message += node.data;
						else {
							message += `{${values.length}}`;
							values.push(expressionSource(content, node));
						}
					}
					const msg = norm(message);
					const start = run[0].start;
					const end = run[run.length - 1].end;
					if (run.length === 1 && isExpr(run[0])) {
						runs.push({
							kind: "expression",
							start,
							end,
							message: msg,
							text: `{__gb_t(${values[0]})}`,
						});
					} else if (msg && KEYS.has(msg)) {
						const args = values.length ? `, [${values.join(", ")}]` : "";
						runs.push({
							kind: "translated",
							start,
							end,
							message: msg,
							text: `{__gb_t(${JSON.stringify(msg)}${args})}`,
						});
					} else if (msg) {
						runs.push({ kind: "missing", start, end, message: msg });
					}
				}
			} else {
				i++;
			}
		}
		for (const node of children) {
			if (!node || isText(node) || isExpr(node)) continue;
			walk(node);
		}
	};

	const collectAttributes = (node) => {
		if (!Array.isArray(node.attributes)) return;
		for (const attribute of node.attributes) {
			if (attribute.type !== "Attribute") continue;
			if (!TRANSLATABLE_ATTRIBUTES.has(attribute.name)) continue;
			const value = attribute.value;
			// Literal only: a single Text node. `{...}` values are left alone.
			if (!Array.isArray(value) || value.length !== 1 || value[0].type !== "Text") continue;
			const msg = norm(value[0].data);
			if (!msg || !/[A-Za-z]/.test(msg)) continue;
			if (KEYS.has(msg)) {
				runs.push({
					kind: "translated",
					start: value[0].start,
					end: value[0].end,
					message: msg,
					text: `{__gb_t(${JSON.stringify(msg)})}`,
				});
			} else {
				runs.push({ kind: "missing", start: value[0].start, end: value[0].end, message: msg });
			}
		}
	};

	const walk = (node) => {
		if (!node || typeof node !== "object" || seen.has(node)) return;
		seen.add(node);
		// Raw/code-like elements are deliberately not translated.
		if (node.type === "Element" && SKIP_ELEMENTS.has(String(node.name || "").toLowerCase())) return;
		collectAttributes(node);
		// Svelte 5 uses `nodes`; older parsers used `children`.
		const children = node.nodes || node.children;
		if (Array.isArray(children)) processChildren(children);
		for (const key of [
			"fragment",
			"consequent",
			"alternate",
			"fallback",
			"else",
			"pending",
			"then",
			"catch",
			"body",
		]) {
			const value = node[key];
			if (Array.isArray(value)) processChildren(value);
			else if (value && typeof value === "object") walk(value);
		}
	};

	// Svelte 5 exposes the root fragment as `fragment`; older versions used `html`.
	if (ast.fragment || ast.html) walk(ast.fragment || ast.html);
	return { handLocalized: false, runs };
}

function transformMarkup(content, filename) {
	const collected = collectMarkupMessages(content, filename);
	if (!collected || collected.handLocalized) return null;

	const changes = [];
	for (const run of collected.runs) {
		if (run.kind === "expression" || run.kind === "translated") {
			changes.push({ start: run.start, end: run.end, text: run.text });
		}
	}
	if (!changes.length) return null;
	addImport(content, changes);
	const code = applyChanges(content, changes);
	return { code };
}

export function gbI18nPreprocessor() {
	return {
		name: "gb-i18n",
		markup({ content, filename }) {
			const result = transformMarkup(content, filename);
			return result || undefined;
		},
	};
}

export default gbI18nPreprocessor;
