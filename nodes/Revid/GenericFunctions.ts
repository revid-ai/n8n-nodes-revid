import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { SPEC } from './spec';
import type { SpecField, SpecOperation } from './types';

export const USER_AGENT = 'n8n-nodes-revid';

type RevidContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

const STATUS_MESSAGES: Record<number, string> = {
	401: 'Revid did not accept the API key. Copy it again from https://www.revid.ai/account.',
	402: 'This Revid account has no active plan, which the API needs. See https://www.revid.ai/pricing.',
	403: "Revid's firewall blocked the request. Try again in a minute.",
};

export async function revidApiRequest(
	this: RevidContext,
	method: IHttpRequestMethods,
	path: string,
	options: { body?: IDataObject; qs?: IDataObject } = {},
): Promise<IDataObject> {
	const request: IHttpRequestOptions = {
		method,
		url: `${SPEC.baseUrl}${path}`,
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (options.body) request.body = options.body;
	if (options.qs) request.qs = options.qs;

	const response = (await this.helpers.httpRequestWithAuthentication.call(
		this,
		'revidApi',
		request,
	)) as {
		statusCode: number;
		body: IDataObject | string;
	};
	const body = typeof response.body === 'string' ? safeJson(response.body) : response.body;
	if (response.statusCode >= 400) {
		const apiMessage =
			body && typeof body === 'object'
				? (body.error as string) || (body.message as string)
				: undefined;
		const message =
			response.statusCode === 401 ||
			response.statusCode === 403 ||
			(response.statusCode === 402 && !apiMessage)
				? STATUS_MESSAGES[response.statusCode]
				: apiMessage || `Revid answered ${response.statusCode}.`;
		throw new NodeApiError(this.getNode(), (body as JsonObject) ?? {}, {
			message,
			httpCode: String(response.statusCode),
		});
	}
	return (body as IDataObject) ?? {};
}

function safeJson(text: string): IDataObject | string {
	try {
		return JSON.parse(text) as IDataObject;
	} catch {
		return text;
	}
}

// ---------------------------------------------------------------------------
// Inputs to request

function isEmpty(value: unknown): boolean {
	return (
		value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
	);
}

function toList(raw: unknown): string[] {
	const items = Array.isArray(raw) ? raw : String(raw).split(/[\n,]/);
	return items.map((item) => String(item).trim()).filter(Boolean);
}

export function coerce(field: SpecField, raw: unknown): unknown {
	if (isEmpty(raw) || (Array.isArray(raw) && raw.length === 0)) return undefined;
	switch (field.type) {
		case 'integer':
		case 'number': {
			const value =
				field.type === 'integer'
					? Number.parseInt(String(raw), 10)
					: Number.parseFloat(String(raw));
			if (Number.isNaN(value)) throw new Error(`${field.label} must be a number.`);
			// Number fields of n8n collections start at 0: 0 means "not set".
			return value === 0 ? undefined : value;
		}
		case 'boolean':
			if (typeof raw === 'boolean') return raw;
			return ['true', 'yes', '1'].includes(String(raw).toLowerCase());
		case 'urls':
			return toList(raw);
		case 'mediaUrls':
			return toList(raw).map((url) => ({ url }));
		case 'json': {
			const value = typeof raw === 'string' ? safeJson(raw) : raw;
			if (!value || typeof value !== 'object' || Array.isArray(value))
				throw new Error(
					`${field.label} must be a JSON object, for example {"source": {"prompt": "..."}}.`,
				);
			return value;
		}
		case 'select':
			return field.multiple ? toList(raw) : String(raw).trim();
		default:
			return typeof raw === 'string' ? raw.trim() : raw;
	}
}

function setPath(target: IDataObject, path: string, value: unknown) {
	const parts = path.split('.');
	let cursor = target;
	for (const part of parts.slice(0, -1)) {
		if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
		cursor = cursor[part] as IDataObject;
	}
	cursor[parts[parts.length - 1]] = value as IDataObject[keyof IDataObject];
}

function mergeDeep(target: IDataObject, source: IDataObject): IDataObject {
	for (const [key, value] of Object.entries(source)) {
		const current = target[key];
		if (
			value &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			current &&
			typeof current === 'object'
		)
			mergeDeep(current as IDataObject, value as IDataObject);
		else target[key] = value;
	}
	return target;
}

export function buildRequest(operation: SpecOperation, inputs: IDataObject) {
	const { method, path, constant, query } = operation.request;
	if (method === 'GET') {
		const qs: IDataObject = { ...((query ?? {}) as IDataObject) };
		for (const field of operation.fields) {
			const value = coerce(field, inputs[field.key]);
			if (value === undefined || !field.api) continue;
			qs[field.api] = Array.isArray(value) ? value.join(',') : String(value);
		}
		return { method, path, qs };
	}

	const body: IDataObject = {};
	for (const field of operation.fields) {
		const value = coerce(field, inputs[field.key]);
		if (value === undefined) continue;
		if (field.type === 'json' && !field.api) mergeDeep(body, value as IDataObject);
		else if (field.api) setPath(body, field.api, value);
	}
	Object.assign(body, constant ?? {});
	return { method, path, body };
}

// ---------------------------------------------------------------------------
// Answers to items

const viewUrl = (pid: string) => `${SPEC.baseUrl}/view/${pid}`;
const editorUrl = (pid: string) => `${SPEC.baseUrl}/editor/${pid}`;

export function videoFromRender(data: IDataObject): IDataObject {
	const pid = String(data.pid);
	return {
		pid,
		status: 'building',
		workflow: data.workflow,
		videoUrl: '',
		viewUrl: viewUrl(pid),
		editorUrl: editorUrl(pid),
	};
}

export function videoFromStatus(data: IDataObject): IDataObject {
	const pid = String(data.pid);
	return {
		pid,
		status: data.status,
		videoUrl: data.videoUrl ?? '',
		viewUrl: viewUrl(pid),
		editorUrl: editorUrl(pid),
		creditsConsumed: data.creditsConsumed,
		error: data.error,
	};
}

export function videoFromProject(project: IDataObject): IDataObject {
	const pid = String(project.pid);
	return {
		pid,
		status: project.status,
		name: project.name,
		videoUrl: project.urlLastExport ?? '',
		viewUrl: viewUrl(pid),
		editorUrl: editorUrl(pid),
		creditsConsumed: project.creditsConsumed,
		createdAt: project.createdAt,
		updatedAt: project.updatedAt,
	};
}

export function mediaResult(data: IDataObject, mediaIds: string[]): IDataObject {
	const media = Array.isArray(data.media) ? (data.media as IDataObject[]) : [];
	const urls = media.filter((item) => item.url).map((item) => item.url as string);
	return { status: data.status, mediaIds: mediaIds.join(','), url: urls[0] ?? '', urls, media };
}
