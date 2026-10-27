import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class RevidApi implements ICredentialType {
	name = 'revidApi';

	displayName = 'Revid API';

	icon: Icon = {
		light: 'file:../nodes/Revid/revid.svg',
		dark: 'file:../nodes/Revid/revid.dark.svg',
	};

	documentationUrl = 'https://github.com/revid-ai/n8n-nodes-revid#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Find your API key in <a href="https://www.revid.ai/account">your Revid account</a>, API section. The Revid API needs an active Revid plan.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				key: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://www.revid.ai',
			url: '/api/public/v3/me',
			headers: { 'User-Agent': 'n8n-nodes-revid' },
		},
	};
}
