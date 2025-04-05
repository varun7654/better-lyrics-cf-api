import { Musixmatch } from './Musixmatch';
import { awaitLists } from './index';

const youtubeSnippetAPI = "https://www.googleapis.com/youtube/v3/videos";

type videoMetaType = {
    kind: string,
    etag: string,
    items: [{
        contentDetails: {
            duration: string // ISO 8601
        },
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
const cache = caches.default;

export async function getLyrics(request: Request<unknown, IncomingRequestCfProperties<unknown>>, env: Env): Promise<Response> {
    let cachedResponse = await cache.match(request.url);
    if (cachedResponse) {
        console.log("Returning cached response");
        return cachedResponse;
    }

    let params = new URL(request.url).searchParams;
    let artist = params.get("artist");
    let song = params.get("song");
    let album: string | null = null;
    let duration = params.get('duration');
    let parsedSongAndArtist: string | null = null;
    let videoId = params.get("videoId");
    let description: string | null = null;
    let enhanced = (params.get("enhanced") || "false").toLowerCase() === "true";

    if (!videoId) {
        return new Response(JSON.stringify("Invalid Video Id"), { status: 400 });
    }


    let tokenPromise = mx.getToken();

    let snippetUrl = new URL(youtubeSnippetAPI);
    snippetUrl.searchParams.set("id", videoId);
    snippetUrl.searchParams.set("key", env.GOOGLE_API_KEY);
    snippetUrl.searchParams.set('part', 'snippet,contentDetails');

    let videoMeta: videoMetaType | undefined = await cache.match(snippetUrl).then(response => response?.json());
    if (!videoMeta) {
        videoMeta = await fetch(snippetUrl).then(response => {
            awaitLists.add(cache.put(response.url, response.clone()));
            return response.json();
        });
    }

    if (videoMeta && videoMeta.items && videoMeta.items.length > 0
        && videoMeta.items[0] && videoMeta.items[0].snippet && videoMeta.items[0].contentDetails) {
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
                song = splitSongAndArtist[0].trim();

                splitSongAndArtist.shift();
                artist = splitSongAndArtist.map(artist => artist.trim()).join(' & ');

            }
        }

        let contentDetails = videoMeta.items[0].contentDetails;
        if (contentDetails && contentDetails.duration) {
            const match = contentDetails.duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const minutes = match[1] ? parseInt(match[1], 10) : 0;
                const seconds = match[2] ? parseInt(match[2], 10) : 0;

                duration = String(60 * minutes + seconds);
            }
        }
    }

    if (!song) {
        return new Response(JSON.stringify({
            message: "A Song wasn't provided and couldn't be inferred",
            song,
            artist,
            album,
            duration,
            parsedSongAndArtist,
            videoId,
            description,
        }), { status: 400 });
    }

    if (!artist) {
        return new Response(JSON.stringify({
            message: "An Artist wasn't provided and couldn't be inferred",
            song,
            artist,
            album,
            duration,
            parsedSongAndArtist,
            videoId,
            description,
        }), { status: 400 });
    }


    let response = {
        song,
        artist,
        album,
        duration,
        parsedSongAndArtist,
        videoId,
        description,
        debugInfo: null as any,
        lyrics: null as (String | null | undefined),
    };
    try {
        await tokenPromise;
        let lyrics = await mx.getLrc(artist, song, album, enhanced);
        if (lyrics) {
            response.lyrics = lyrics.synced;
            response.debugInfo = lyrics.debugInfo;
        }
    } catch (e) {
        console.error(e);
    }


    let json = JSON.stringify(response);

    let cacheableResponse = new Response(json, { status: 200 });
    if (response.lyrics) {
        cacheableResponse.headers.set("Cache-control", "public; max-age=604800");
    } else {
        // cache the request only for a short time
        cacheableResponse.headers.set("Cache-control", "public; max-age=600");
    }
    awaitLists.add(cache.put(request.url, cacheableResponse));


    return new Response(json, { status: 200 });

}
