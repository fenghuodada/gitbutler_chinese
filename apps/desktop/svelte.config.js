import svelteInjectComment from "@gitbutler/svelte-comment-injector";
import staticAdapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { gbI18nPreprocessor } from "../../scripts/i18n/preprocessor.mjs";

const config = {
	preprocess: [gbI18nPreprocessor(), vitePreprocess({ script: true }), svelteInjectComment()],
	kit: {
		alias: {
			$components: "./src/components",
		},
		adapter: staticAdapter({
			pages: "build",
			assets: "build",
			fallback: "index.html",
			precompress: false,
			strict: false,
		}),
	},
	compilerOptions: {
		css: "external",
	},
};

export default config;
