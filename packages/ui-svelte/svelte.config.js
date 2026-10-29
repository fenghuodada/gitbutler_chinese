import staticAdapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { gbI18nPreprocessor } from "../../scripts/i18n/preprocessor.mjs";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [gbI18nPreprocessor(), vitePreprocess()],
	kit: {
		adapter: staticAdapter({
			pages: "build",
			assets: "build",
			fallback: "index.html",
			precompress: false,
			strict: false,
		}),
		alias: {
			$components: "src/lib/components",
		},
	},
	compilerOptions: {
		css: "injected",
	},
};

export default config;
