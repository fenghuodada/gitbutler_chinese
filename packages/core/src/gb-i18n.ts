// @ts-nocheck
/**
 * Lightweight, source-text-keyed i18n runtime for GitButler.
 *
 * Design goals:
 * - Upgrade survivable: translations are keyed by the exact English source text.
 *   Unknown strings simply fall back to English, so a new upstream release can
 *   never break the UI because of a missing translation.
 * - No reactivity needed: the language is resolved synchronously when the module
 *   is first loaded; `setLocalePreference()` persists the choice and reloads.
 * - Usable from plain TypeScript (packages/core is built with tsc, not
 *   svelte-package) and from Svelte components via the `gb-i18n` preprocessor.
 */
import { zhCN } from "./gb-i18n-zh-CN.js";

export type LocalePreference = "system" | "en" | "zh-CN";
export const LOCALE_STORAGE_KEY = "gitbutler.language";
export const SUPPORTED_LOCALE_PREFERENCES = ["system", "en", "zh-CN"];
function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}
function isTauriRuntime() {
    if (typeof window === "undefined")
        return false;
    return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}
function readStoredPreference() {
    try {
        if (typeof localStorage === "undefined")
            return "system";
        const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
        if (stored === "system" || stored === "en" || stored === "zh-CN") {
            return stored;
        }
    }
    catch {
        // localStorage can be unavailable (private mode, SSR, restricted webview).
    }
    return "system";
}
function systemLocale() {
    if (typeof navigator === "undefined")
        return "en";
    const language = (navigator.language || navigator.languages?.[0] || "").toLowerCase();
    return language === "zh" || language.startsWith("zh-") ? "zh-CN" : "en";
}
function isTestEnvironment() {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "test";
}
function resolveLocale(preference) {
    // An explicit choice always wins, also outside of Tauri (browser preview).
    if (preference === "en" || preference === "zh-CN")
        return preference;
    // Unit tests must never depend on the host machine's language.
    if (isTestEnvironment())
        return "en";
    // Automated browser tests (Playwright) must stay deterministic.
    if (typeof navigator !== "undefined" && navigator.webdriver)
        return "en";
    // The marketing site and browser preview always default to English.
    if (!isTauriRuntime())
        return "en";
    return systemLocale();
}
let preference = readStoredPreference();
let locale = resolveLocale(preference);
/**
 * Returns the currently resolved locale.
 */
export function getLocale() {
    return locale;
}
/**
 * Returns the stored preference (`system` unless the user picked a language).
 */
export function getLocalePreference() {
    return preference;
}
function applyDocumentLanguage() {
    if (typeof document === "undefined")
        return;
    try {
        document.documentElement.lang = locale;
    }
    catch {
        // Ignore environments without a real DOM.
    }
}
/**
 * Applies the resolved locale to the document and returns it.
 *
 * The module already resolves the locale on import; this hook exists so the
 * app can apply `<html lang>` before the first render.
 */
export function initI18n() {
    preference = readStoredPreference();
    locale = resolveLocale(preference);
    applyDocumentLanguage();
    return locale;
}
/**
 * Persists a new language preference and reloads the webview so every
 * component renders with the new locale. This avoids making every translation
 * call reactive, which keeps the patch small and upgrade friendly.
 */
export function setLocalePreference(next) {
    if (!SUPPORTED_LOCALE_PREFERENCES.includes(next))
        return;
    try {
        if (typeof localStorage !== "undefined") {
            localStorage.setItem(LOCALE_STORAGE_KEY, next);
        }
    }
    catch {
        // If persistence fails we still reload with the old preference.
    }
    if (typeof location !== "undefined" && typeof location.reload === "function") {
        location.reload();
    }
}
/**
 * Translates an English source string into the active locale.
 *
 * - Exact-match lookup only; unknown strings fall back to `fallback` (or the
 *   English source). This is what makes upstream upgrades safe.
 * - `{0}`, `{1}`, ... are positional placeholders.
 * - `{name}` placeholders are supported when an object is passed.
 *
 * @param message English source text (also the dictionary key).
 * @param values Optional positional array or named object.
 * @param fallback Raw English text to render when the key is missing and
 *   whitespace-normalization changed the source (see the preprocessor).
 */
export function t(message, values, fallback) {
    const translated = locale === "zh-CN" && hasOwn(zhCN, message) ? zhCN[message] : undefined;
    const template = translated || fallback || message;
    if (!values)
        return template;
    if (Array.isArray(values)) {
        if (values.length === 0)
            return template;
        return template.replace(/\{(\d+)\}/g, (match, index) => {
            const value = values[Number(index)];
            return value === undefined ? match : String(value);
        });
    }
    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
        const value = values[name];
        return value === undefined ? match : String(value);
    });
}
// Apply `<html lang>` as early as possible in a browser environment.
applyDocumentLanguage();
//# sourceMappingURL=gb-i18n.js.map