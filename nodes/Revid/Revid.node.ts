import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import { NODE_OPERATIONS, properties } from './descriptions';
import {
	buildRequest,
	mediaResult,
	revidApiRequest,
	USER_AGENT,
	videoFromRender,
	videoFromStatus,
} from './GenericFunctions';
import { SPEC } from './spec';
import type { SpecOperation } from './types';

const RENDER_POLL_MS = 15_000;
const MEDIA_POLL_MS = 5_000;

async function listAccounts(
	this: ILoadOptionsFunctions,
	platform: string,
): Promise<INodePropertyOptions[]> {
	const data = await revidApiRequest.call(this, 'GET', SPEC.dynamicSources.accounts.path);
	return ((data.accounts as IDataObject[]) ?? [])
		.filter((account) => account.platform === platform)
		.map((account) => ({
			name: account.tokenInvalid ? `${account.label} (reconnect in Revid)` : String(account.label),
			value: String(account.id),
		}));
}

function inputsOf(context: IExecuteFunctions, op: SpecOperation, itemIndex: number): IDataObject {
	const inputs: IDataObject = {};
	for (const field of op.fields.filter((f) => f.required && f.type !== 'file'))
		inputs[field.key] = context.getNodeParameter(field.key, itemIndex) as IDataObject[string];
	const additional = op.fields.some((f) => !f.required)
		? (context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject)
		: {};
	return { ...additional, ...inputs };
}

async function waitForVideo(
	context: IExecuteFunctions,
	pid: string,
	maxWaitMinutes: number,
	itemIndex: number,
) {
	const deadline = Date.now() + maxWaitMinutes * 60_000;
	while (Date.now() < deadline) {
		await sleep(RENDER_POLL_MS);
		const video = videoFromStatus(
			await revidApiRequest.call(context, 'GET', '/api/public/v3/status', { qs: { pid } }),
		);
		if (video.status === 'ready' && video.videoUrl) return video;
		if (video.status === 'error' || video.status === 'failed')
			throw new NodeOperationError(
				context.getNode(),
				`The video failed to render: ${video.error ?? 'unknown error'}`,
				{ itemIndex },
			);
	}
	throw new NodeOperationError(
		context.getNode(),
		`The video is still rendering after ${maxWaitMinutes} minutes. Read it later with Video > Get and project ID ${pid}.`,
		{ itemIndex },
	);
}

async function waitForMedia(
	context: IExecuteFunctions,
	mediaIds: string[],
	maxWaitMinutes: number,
	itemIndex: number,
) {
	const deadline = Date.now() + maxWaitMinutes * 60_000;
	while (Date.now() < deadline) {
		await sleep(MEDIA_POLL_MS);
		const data = await revidApiRequest.call(context, 'GET', '/api/public/v3/media-status', {
			qs: { mediaIds: mediaIds.join(',') },
		});
		if (data.status === 'ready') return mediaResult(data, mediaIds);
		if (data.status === 'failed') {
			const reason = ((data.media as IDataObject[]) ?? []).map((item) => item.error).find(Boolean);
			throw new NodeOperationError(
				context.getNode(),
				`The generation failed: ${reason ?? 'unknown error'}`,
				{ itemIndex },
			);
		}
	}
	throw new NodeOperationError(
		context.getNode(),
		`The media is still generating after ${maxWaitMinutes} minutes. Read it later with Media > Get Status and media IDs ${mediaIds.join(',')}.`,
		{ itemIndex },
	);
}

async function uploadFile(
	context: IExecuteFunctions,
	inputs: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const propertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
	const binary = context.helpers.assertBinaryData(itemIndex, propertyName);
	const bytes = await context.helpers.getBinaryDataBuffer(itemIndex, propertyName);
	const fileName = String(inputs.fileName || binary.fileName || 'file').trim();
	const contentType = binary.mimeType;
	if (!/^(image|video|audio)\//.test(contentType))
		throw new NodeOperationError(
			context.getNode(),
			`Revid accepts image, video and audio files only, not ${contentType}.`,
			{ itemIndex },
		);

	const target = await revidApiRequest.call(context, 'POST', '/api/public/v3/upload', {
		body: { fileName, contentType },
	});
	await context.helpers.httpRequest({
		method: 'PUT',
		url: String(target.uploadUrl),
		headers: {
			...((target.headers as IDataObject) ?? { 'Content-Type': contentType }),
			'User-Agent': USER_AGENT,
		},
		body: bytes,
	});
	return { url: target.url, fileName, contentType };
}

async function runOperation(
	context: IExecuteFunctions,
	op: SpecOperation,
	itemIndex: number,
): Promise<IDataObject[]> {
	const inputs = inputsOf(context, op, itemIndex);
	if (op.uploads) return [await uploadFile(context, inputs, itemIndex)];

	const request = buildRequest(op, inputs);
	if (op.generatesMedia && request.body) request.body.async = true;
	const data = await revidApiRequest.call(context, request.method, request.path, {
		body: request.body,
		qs: request.qs,
	});
	const wait =
		(op.renders || op.generatesMedia) &&
		(context.getNodeParameter('waitForCompletion', itemIndex, true) as boolean);
	const maxWaitMinutes = wait
		? (context.getNodeParameter('maxWaitMinutes', itemIndex, 30) as number)
		: 0;

	if (op.renders) {
		const video = videoFromRender(data);
		return [
			wait ? await waitForVideo(context, String(video.pid), maxWaitMinutes, itemIndex) : video,
		];
	}
	if (op.generatesMedia) {
		const mediaIds = (data.mediaIds as string[]) ?? [];
		return [
			wait
				? await waitForMedia(context, mediaIds, maxWaitMinutes, itemIndex)
				: mediaResult(
						{
							status: data.status,
							media: mediaIds.map((mediaId) => ({ mediaId, status: 'processing' })),
						},
						mediaIds,
					),
		];
	}
	if (op.key === 'findVideo') return [videoFromStatus(data)];
	if (op.key === 'findGeneratedMedia')
		return [
			mediaResult(
				data,
				String(inputs.mediaIds)
					.split(',')
					.map((id) => id.trim()),
			),
		];
	if (op.returnsList) return (data[op.returnsList] as IDataObject[]) ?? [];
	return [data];
}

export class Revid implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revid',
		name: 'revid',
		icon: { light: 'file:revid.svg', dark: 'file:revid.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Create AI videos, captions, clips and images, and publish them to social media',
		defaults: { name: 'Revid' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'revidApi', required: true }],
		properties,
	};

	methods = {
		loadOptions: {
			async getVoices(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const source = SPEC.dynamicSources.voices;
				const data = await revidApiRequest.call(this, 'GET', source.path, {
					qs: source.query as IDataObject,
				});
				return ((data.voices as IDataObject[]) ?? []).map((voice) => ({
					name: voice.category === 'custom' ? `${voice.name} (my voice)` : String(voice.name),
					value: String(voice.voiceId),
					description: voice.description as string,
				}));
			},
			async getVisualPresets(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await revidApiRequest.call(
					this,
					'GET',
					SPEC.dynamicSources.visualPresets.path,
				);
				const presets = ((data.visualPresets as IDataObject)?.presets as IDataObject[]) ?? [];
				return presets
					.filter((preset) => !SPEC.hiddenPresets.includes(String(preset.value)))
					.map((preset) => ({ name: String(preset.label), value: String(preset.value) }));
			},
			async getMusicTracks(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const data = await revidApiRequest.call(this, 'GET', SPEC.dynamicSources.musicTracks.path);
				return ((data.tracks as IDataObject[]) ?? []).map((track) => ({
					name: String(track.trackName),
					value: String(track.trackName),
					description: track.description as string,
				}));
			},
			async getTiktokAccounts(this: ILoadOptionsFunctions) {
				return await listAccounts.call(this, 'tiktok');
			},
			async getYoutubeAccounts(this: ILoadOptionsFunctions) {
				return await listAccounts.call(this, 'youtube');
			},
			async getInstagramAccounts(this: ILoadOptionsFunctions) {
				return await listAccounts.call(this, 'instagram');
			},
			async getXAccounts(this: ILoadOptionsFunctions) {
				return await listAccounts.call(this, 'x');
			},
			async getFacebookPages(this: ILoadOptionsFunctions) {
				return await listAccounts.call(this, 'facebook');
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const key = this.getNodeParameter('operation', i) as string;
				const op = NODE_OPERATIONS.find((operation) => operation.key === key);
				if (!op)
					throw new NodeOperationError(this.getNode(), `Unknown operation "${key}"`, {
						itemIndex: i,
					});
				const results = await runOperation(this, op, i);
				returnData.push(...results.map((json) => ({ json, pairedItem: { item: i } })));
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError)
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, {
						itemIndex: i,
						message: error.message,
						httpCode: error.httpCode ?? undefined,
					});
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
