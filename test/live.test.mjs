// Runs the built node (dist/) against the production Revid API with a minimal
// stand-in for n8n's execution context. Needs REVID_API_KEY; REVID_LIVE_SPEND=1
// also runs the image generation.
//   npm run build && node --test test/
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { Revid } = require('../dist/nodes/Revid/Revid.node.js');
const { RevidTrigger } = require('../dist/nodes/Revid/RevidTrigger.node.js');
const { RevidApi } = require('../dist/credentials/RevidApi.credentials.js');

const apiKey = process.env.REVID_API_KEY;
const live = { skip: !apiKey && 'REVID_API_KEY is not set', timeout: 120000 };
const spend = {
	skip:
		(!apiKey && 'REVID_API_KEY is not set') ||
		(!process.env.REVID_LIVE_SPEND && 'REVID_LIVE_SPEND is not set'),
	timeout: 180000,
};

async function httpRequest(options) {
	const url = new URL(options.url);
	for (const [key, value] of Object.entries(options.qs ?? {}))
		url.searchParams.set(key, String(value));
	const isBuffer = Buffer.isBuffer(options.body);
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers: {
			...(options.json && !isBuffer ? { 'Content-Type': 'application/json' } : {}),
			...options.headers,
		},
		body:
			options.body === undefined
				? undefined
				: isBuffer
					? options.body
					: JSON.stringify(options.body),
	});
	const text = await response.text();
	let body = text;
	try {
		body = JSON.parse(text);
	} catch {}
	if (!options.ignoreHttpStatusErrors && response.status >= 400)
		throw new Error(`HTTP ${response.status}`);
	return options.returnFullResponse ? { statusCode: response.status, body } : body;
}

const credential = new RevidApi();
const helpers = {
	httpRequest,
	httpRequestWithAuthentication: async (name, options) => {
		assert.equal(name, credential.name);
		return httpRequest({ ...options, headers: { ...options.headers, key: apiKey } });
	},
	returnJsonArray: (items) => items.map((json) => ({ json })),
	assertBinaryData: () => ({ mimeType: 'image/png', fileName: 'n8n-test-logo.png' }),
	getBinaryDataBuffer: async () =>
		Buffer.from(
			await (await fetch('https://www.revid.ai/revid_logo_square_bg_512.png')).arrayBuffer(),
		),
};

function context(params, items = [{ json: {} }]) {
	return {
		getInputData: () => items,
		getNodeParameter: (name, _index, fallback) => (name in params ? params[name] : fallback),
		getNode: () => ({
			name: 'Revid',
			type: 'n8n-nodes-revid.revid',
			typeVersion: 1,
			parameters: params,
		}),
		continueOnFail: () => false,
		helpers,
	};
}

const run = async (params) =>
	(await new Revid().execute.call(context(params)))[0].map((item) => item.json);

test('every operation of the spec is reachable in the node description', () => {
	const description = new Revid().description;
	const operationValues = description.properties
		.filter((p) => p.name === 'operation')
		.flatMap((p) => p.options.map((o) => o.value));
	assert.equal(operationValues.length, 18);
	assert.ok(description.usableAsTool);
});

test('dropdowns load voices, styles without brand names and accounts', live, async () => {
	const methods = new Revid().methods.loadOptions;
	const ctx = context({});
	const voices = await methods.getVoices.call(ctx);
	assert.ok(voices.length > 5);
	const presets = await methods.getVisualPresets.call(ctx);
	assert.ok(presets.length > 10 && !presets.some((p) => p.value === 'PIXAR'));
	const tracks = await methods.getMusicTracks.call(ctx);
	assert.ok(tracks.length > 50);
	const youtube = await methods.getYoutubeAccounts.call(ctx);
	assert.ok(Array.isArray(youtube));
});

test(
	'Video > Get reads a rendered video and Viral Video > Search returns items',
	live,
	async () => {
		const trigger = new RevidTrigger();
		const pollCtx = { ...context({}), getMode: () => 'manual', getWorkflowStaticData: () => ({}) };
		const [[latest]] = await trigger.poll.call(pollCtx);
		assert.ok(latest.json.videoUrl);
		const [video] = await run({ resource: 'video', operation: 'findVideo', pid: latest.json.pid });
		assert.equal(video.status, 'ready');
		const results = await run({
			resource: 'research',
			operation: 'searchViralVideos',
			query: 'cooking hacks',
			additionalFields: { limit: 2, platforms: ['tiktok', 'youtube'] },
		});
		assert.ok(results.length > 0 && results.length <= 2 && results[0].url);
	},
);

test('the trigger emits nothing on its first poll, then only new videos', live, async () => {
	const state = {};
	const pollCtx = { ...context({}), getMode: () => 'trigger', getWorkflowStaticData: () => state };
	const trigger = new RevidTrigger();
	assert.equal(await trigger.poll.call(pollCtx), null);
	assert.ok(state.seen.length > 0);
	const dropped = state.seen.shift();
	const [items] = await trigger.poll.call(pollCtx);
	assert.deepEqual(
		items.map((item) => item.json.pid),
		[dropped],
	);
});

test('a bad key fails with a readable message', live, async () => {
	const ctx = context({ resource: 'video', operation: 'findVideo', pid: 'x' });
	ctx.helpers = {
		...helpers,
		httpRequestWithAuthentication: (name, options) =>
			httpRequest({ ...options, headers: { ...options.headers, key: 'wrong' } }),
	};
	await assert.rejects(new Revid().execute.call(ctx), /API key/);
});

test('File > Upload and Media > Generate Image', spend, async () => {
	const [file] = await run({
		resource: 'file',
		operation: 'uploadFile',
		binaryPropertyName: 'data',
		additionalFields: {},
	});
	assert.match(file.url, /^https:\/\/cdn\.revid\.ai\//);
	const [image] = await run({
		resource: 'media',
		operation: 'generateImage',
		prompt: 'a lighthouse at dawn, watercolor',
		waitForCompletion: true,
		maxWaitMinutes: 3,
		additionalFields: { imageQuality: 'cheap', ratio: '9:16' },
	});
	assert.equal(image.status, 'ready');
	assert.match(image.url, /^https:\/\//);
});
