import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { revidApiRequest, videoFromProject } from './GenericFunctions';

const SEEN_LIMIT = 500;

export class RevidTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revid Trigger',
		name: 'revidTrigger',
		icon: { light: 'file:revid.svg', dark: 'file:revid.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New Video',
		description: 'Starts the workflow when a video finishes rendering in Revid',
		defaults: { name: 'Revid Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'revidApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [
					{
						name: 'New Video',
						value: 'newVideo',
						description: 'A video finished rendering (from the app, the API or an automation)',
					},
				],
				default: 'newVideo',
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const data = await revidApiRequest.call(this, 'GET', '/api/public/v3/projects', {
			qs: { limit: 50 },
		});
		const videos = ((data.projects as IDataObject[]) ?? [])
			.filter((project) => project.urlLastExport)
			.map(videoFromProject);

		if (this.getMode() === 'manual')
			return videos.length ? [this.helpers.returnJsonArray(videos.slice(0, 1))] : null;

		const state = this.getWorkflowStaticData('node') as { seen?: string[] };
		// First poll after activation: remember what exists, emit nothing.
		if (!state.seen) {
			state.seen = videos.map((video) => String(video.pid));
			return null;
		}
		const seen = new Set(state.seen);
		const fresh = videos.filter((video) => !seen.has(String(video.pid)));
		state.seen = [...fresh.map((video) => String(video.pid)), ...state.seen].slice(0, SEEN_LIMIT);
		return fresh.length ? [this.helpers.returnJsonArray(fresh.reverse())] : null;
	}
}
