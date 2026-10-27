# n8n-nodes-revid

This is an n8n community node for [Revid](https://www.revid.ai), the AI video generator. It lets your n8n workflows and AI agents turn prompts, scripts, articles and long videos into short videos, add captions, generate images and clips, research viral videos and publish to TikTok, YouTube, Instagram, X and Facebook.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Compatibility](#compatibility) · [Usage](#usage) · [Resources](#resources) · [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. In short: open **Settings > Community Nodes**, click **Install**, enter `n8n-nodes-revid` and confirm.

## Operations

The package has two nodes.

**Revid** (also usable as a tool by the n8n AI Agent)

| Resource | Operation | What it does |
|---|---|---|
| Video | Create From Prompt | Turns an idea into a short video: the AI writes the script, then makes the visuals, voice-over and captions. |
| Video | Create From Script | Makes a voiced, captioned video from your exact script. |
| Video | Create From Article | Turns a blog post, news article or web page URL into a short video. |
| Video | Create Talking Avatar | Makes a talking avatar read your script, from one photo. |
| Video | Add Captions | Adds animated word-by-word captions to an existing video. |
| Video | Create Clips | Cuts a long video (podcast, webinar, YouTube link) into short vertical clips. |
| Video | Create Music Video | Makes a music video for a song, synced to the beat or the lyrics. |
| Video | Create Product Ad | Makes a short video ad from a description and product photos. |
| Video | Create (Advanced) | Any Revid workflow with the full render options as JSON. |
| Video | Get | Reads a video's status and URL from its project ID. |
| Media | Generate Image | Generates AI images from a prompt. |
| Media | Generate Video Clip | Generates a short AI video clip from a prompt or a first frame. |
| Media | Get Status | Reads generated images or clips from their media IDs. |
| Post | Publish Now | Posts a video now to the social accounts connected in Revid. |
| Post | Schedule | Schedules a video at a set time or at the next open slot of your posting schedule. |
| Post | Get Status | Checks whether a post went out, platform by platform. |
| File | Upload | Uploads a binary file (image, video or audio) and returns a public URL for the other operations. |
| Viral Video | Search | Searches viral short-form videos across TikTok, YouTube, Instagram, X, Reddit, Threads and LinkedIn, with transcripts and engagement. |

Video and media operations have a **Wait for Completion** option (on by default): the node checks the render every 15 seconds and outputs the finished video URL, up to **Max Wait (Minutes)**. Turn it off to continue at once with the project ID, then read the video later with **Video > Get**.

**Revid Trigger**

| Event | What it does |
|---|---|
| New Video | Starts the workflow when a video finishes rendering in your Revid account (from the app, the API or an automation). |

## Credentials

You need a Revid account with an active plan (the Revid API is included in every paid plan, see [pricing](https://www.revid.ai/pricing)).

1. Sign in to Revid and open [your account page](https://www.revid.ai/account).
2. Copy your API key from the API section.
3. In n8n, create a **Revid API** credential and paste the key.

The node sends the key in the `key` header to `https://www.revid.ai/api/public/v3/*` only.

## Compatibility

Built and tested with n8n 2.x (`n8nNodesApiVersion` 1). The node has no runtime dependencies.

## Usage

**Make a video and post it.** Add **Revid > Video > Create From Prompt**, write the prompt (or map it from a previous node), leave Wait for Completion on, then add **Revid > Post > Publish Now** and map `videoUrl` from the first node.

**Let an AI Agent make videos.** Add the Revid node as a tool of an **AI Agent** node. The agent picks the operation and fills the fields from the conversation, for example: "Make a 30 second vertical video about our new feature and schedule it on TikTok for Friday 6pm."

**Files from other nodes.** Revid takes media as public URLs. To use a file from Google Drive, an email attachment or an HTTP download, run **Revid > File > Upload** first and pass its `url` on.

**Credits.** Each video uses Revid credits, like in the app. Estimate a render with the free [calculate-credits endpoint](https://www.revid.ai/docs).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Revid for n8n](https://www.revid.ai/integrations/n8n)
- [Revid API documentation](https://www.revid.ai/docs)
- [Revid MCP server](https://www.revid.ai/mcp) and [Revid CLI](https://www.npmjs.com/package/revid-cli)

## Version history

### 0.1.0

First release: 18 operations on 5 resources, the New Video trigger, and the Revid API credential.
