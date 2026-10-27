// Builds the node's parameters from the generated spec: one Resource picker,
// one Operation picker per resource, the required fields of each operation,
// and its optional fields in an "Additional Fields" collection.
import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';
import { SPEC } from './spec';
import type { SpecField, SpecOperation } from './types';

export const RESOURCES: INodePropertyOptions[] = [
	{ name: 'File', value: 'file' },
	{ name: 'Media', value: 'media' },
	{ name: 'Post', value: 'post' },
	{ name: 'Video', value: 'video' },
	{ name: 'Viral Video', value: 'research' },
];

export const NODE_OPERATIONS = SPEC.operations.filter((op) => op.kind !== 'trigger');

export const LOAD_OPTIONS_METHODS: Record<string, string> = {
	voices: 'getVoices',
	visualPresets: 'getVisualPresets',
	musicTracks: 'getMusicTracks',
	'account:tiktok': 'getTiktokAccounts',
	'account:youtube': 'getYoutubeAccounts',
	'account:instagram': 'getInstagramAccounts',
	'account:x': 'getXAccounts',
	'account:facebook': 'getFacebookPages',
};

const sentenceCase = (label: string) => label.charAt(0) + label.slice(1).toLowerCase();

function parameter(field: SpecField): INodeProperties {
	const base = {
		displayName: field.label,
		name: field.key,
		description: field.help,
		placeholder: field.placeholder,
		required: Boolean(field.required),
	};
	const loadOptionsMethod = field.dynamic ? LOAD_OPTIONS_METHODS[field.dynamic] : undefined;
	if (loadOptionsMethod)
		return { ...base, type: 'options', typeOptions: { loadOptionsMethod }, default: '' };

	switch (field.type) {
		case 'text':
			return { ...base, type: 'string', typeOptions: { rows: 4 }, default: '' };
		case 'integer':
		case 'number':
			return { ...base, type: 'number', default: 0 };
		case 'boolean':
			return { ...base, type: 'boolean', default: field.default === true };
		case 'datetime':
			return { ...base, type: 'dateTime', default: '' };
		case 'json':
			return { ...base, type: 'json', default: '{}' };
		case 'file':
			return {
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				hint: 'The name of the input binary field holding the file',
			};
		case 'urls':
		case 'mediaUrls':
			return {
				...base,
				type: 'string',
				default: '',
				description: `${field.help ?? ''} Separate URLs with commas.`.trim(),
			};
		case 'select': {
			const options = (field.choices ?? []).map((choice) => ({
				name: choice.label,
				value: choice.value,
			}));
			return field.multiple
				? { ...base, type: 'multiOptions', options, default: [] }
				: { ...base, type: 'options', options, default: options[0]?.value ?? '' };
		}
		default:
			return { ...base, type: 'string', default: '' };
	}
}

function clean(property: INodeProperties): INodeProperties {
	return Object.fromEntries(
		Object.entries(property).filter(([, value]) => value !== undefined),
	) as INodeProperties;
}

function operationPicker(resource: string): INodeProperties {
	const operations = NODE_OPERATIONS.filter((op) => op.resource === resource);
	const picker: INodeProperties = {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options: operations.map((op) => ({
			name: op.n8nName ?? op.label,
			value: op.key,
			description: op.description,
			action: sentenceCase(op.label),
		})),
		default: '',
	};
	// The first operation of the resource is preselected.
	picker.default = operations[0].key;
	return picker;
}

function waitParameters(op: SpecOperation): INodeProperties[] {
	if (!op.renders && !op.generatesMedia) return [];
	const show = { resource: [op.resource], operation: [op.key] };
	return [
		{
			displayName: 'Wait for Completion',
			name: 'waitForCompletion',
			type: 'boolean',
			default: true,
			displayOptions: { show },
			description: op.renders
				? 'Whether to wait until the video is rendered (usually 2 to 10 minutes) so the next node gets its video URL'
				: 'Whether to wait until the media is generated so the next node gets its URL',
		},
		{
			displayName: 'Max Wait (Minutes)',
			name: 'maxWaitMinutes',
			type: 'number',
			default: 30,
			typeOptions: { minValue: 1, maxValue: 120 },
			displayOptions: { show: { ...show, waitForCompletion: [true] } },
			description: 'How long to wait before the node fails with a timeout',
		},
	];
}

function operationParameters(op: SpecOperation): INodeProperties[] {
	const show = { resource: [op.resource], operation: [op.key] };
	const required = op.fields.filter((field) => field.required);
	const optional = op.fields
		.filter((field) => !field.required)
		.sort((a, b) => a.label.localeCompare(b.label));
	const properties = required.map((field) =>
		clean({ ...parameter(field), displayOptions: { show } }),
	);
	properties.push(...waitParameters(op));
	if (optional.length)
		properties.push({
			displayName: op.kind === 'search' ? 'Filters' : 'Additional Fields',
			name: 'additionalFields',
			type: 'collection',
			placeholder: op.kind === 'search' ? 'Add Filter' : 'Add Field',
			default: {},
			displayOptions: { show },
			options: optional.map((field) => clean({ ...parameter(field), required: undefined })),
		});
	return properties;
}

export const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: RESOURCES,
		default: 'video',
	},
	...RESOURCES.map((resource) => operationPicker(resource.value as string)),
	...NODE_OPERATIONS.flatMap(operationParameters),
];
