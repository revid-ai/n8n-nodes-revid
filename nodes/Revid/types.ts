export type FieldType =
	| 'string'
	| 'text'
	| 'integer'
	| 'number'
	| 'boolean'
	| 'select'
	| 'urls'
	| 'mediaUrls'
	| 'json'
	| 'datetime'
	| 'file';

export interface SpecChoice {
	value: string;
	label: string;
}

export interface SpecField {
	key: string;
	label: string;
	type: FieldType;
	api?: string;
	required?: boolean;
	help?: string;
	placeholder?: string;
	advanced?: boolean;
	multiple?: boolean;
	default?: boolean;
	choices?: SpecChoice[];
	dynamic?: string;
}

export interface SpecOperation {
	key: string;
	kind: 'action' | 'search' | 'trigger';
	noun: string;
	resource: string;
	label: string;
	n8nName?: string;
	description: string;
	request: {
		method: 'GET' | 'POST';
		path: string;
		constant?: Record<string, unknown>;
		query?: Record<string, unknown>;
	};
	renders?: boolean;
	generatesMedia?: boolean;
	uploads?: boolean;
	returnsList?: string;
	fields: SpecField[];
	sample?: unknown;
	outputFields?: Array<{ key: string; label: string; type?: string }>;
}

export interface RevidSpec {
	generatedFrom: string;
	baseUrl: string;
	auth: { header: string; testPath: string; keyUrl: string; label: string; help: string };
	hiddenPresets: string[];
	dynamicSources: Record<
		string,
		{
			path: string;
			list: string;
			value: string;
			label: string;
			query?: Record<string, unknown>;
			hide?: string[];
		}
	>;
	operations: SpecOperation[];
}
