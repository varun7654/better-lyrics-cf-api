import { Musixmatch } from './Musixmatch';

const youtubeSnippetAPI = "https://www.googleapis.com/youtube/v3/videos";

type videoMetaType = {
	kind: string,
	etag: string,
	items: [{
		kind: string,
		etag: string,
		id: string,
		snippet: {
			publishedAt: string,
			channelId: string
			title: string,
			description: string,
			channelType: string
			defaultLanguage: string,
			tags: string[],
		}
	}]
}

const mx = new Musixmatch();

export async function getLyrics(request: Request<unknown, IncomingRequestCfProperties<unknown>>, env: Env): Promise<Response> {
	let params = new URL(request.url).searchParams;
	console.log(params);
	let artist = params.get("artist");
	let song = params.get("song");
	let album: string | null = null;
	let parsedSongAndArtist: string | null = null;
	let videoId = params.get("videoId");
	let description: string | null = null;

	if (!videoId) {
		return new Response(JSON.stringify("Invalid Video Id"), {status: 400});
	}

	let snippetUrl = new URL(youtubeSnippetAPI);
	snippetUrl.searchParams.set("id", videoId);
	snippetUrl.searchParams.set("key", env.GOOGLE_API_KEY);
	snippetUrl.searchParams.set("part", "snippet");

	let tokenPromise = mx.getToken();
	let videoMeta: videoMetaType = await fetch(snippetUrl).then(response => response.json());
	if (videoMeta && videoMeta.items &&  videoMeta.items.length > 0
		&& videoMeta.items[0] && videoMeta.items[0].snippet) {
		let snippet = videoMeta.items[0].snippet;
		if (snippet.description && snippet.description.endsWith("Auto-generated by YouTube.")) {
			description = snippet.description;
			let desc = snippet.description.split("\n");
			if (desc.length > 4) {
				parsedSongAndArtist = desc[2];
				album = desc[4];
			}

			if (parsedSongAndArtist) {
				let splitSongAndArtist = parsedSongAndArtist.split("·");
				if (!song) {
					song = splitSongAndArtist[0].trim();
				}
				splitSongAndArtist.shift();

				if (!artist) {
					artist = splitSongAndArtist.map(artist => artist.trim()).join(" & ");
				}
			}
		}
	}

	if (!song) {
		return new Response(JSON.stringify({
			message: "A Song wasn't provided and couldn't be inferred",
			song,
			artist,
			album,
			parsedSongAndArtist,
			videoId,
			description,
		}), {status: 400});
	}

	if (!artist) {
		return new Response(JSON.stringify({
			message: "An Artist wasn't provided and couldn't be inferred",
			song,
			artist,
			album,
			parsedSongAndArtist,
			videoId,
			description,
		}), {status: 400});
	}


	let response = {
		song,
		artist,
		album,
		parsedSongAndArtist,
		videoId,
		description,
		lyrics: null as (String | null | undefined),
	}
	await tokenPromise;
	try {
		let lyrics = await mx.getLrc(artist, song, album);
		console.log("Lyrics: " + JSON.stringify(lyrics));
		if (lyrics) {
			response.lyrics = lyrics.synced;
		}
	} catch (e) {
		console.error(e)
	}

	return new Response(JSON.stringify(response));

}
