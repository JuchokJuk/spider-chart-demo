import preprocess from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: preprocess(),
	kit: {
		prerender: {
			crawl: true,
			enabled: true,
			onError: 'continue',
			// default: true,
			entries: [
				"*"
			],
		},
		adapter: adapter(),
		alias: {
			'src/*': 'src/*'
		}
	}
};

export default config;
