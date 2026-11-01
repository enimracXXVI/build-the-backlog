// Deployable source for the GG.deals proxy Cloudflare Worker (GG_WORKER in
// app.js). Handles `?ids=<comma-separated steam appids>&region=<cc>`,
// proxying GG.deals' by-steam-app-id prices endpoint.
//
// Forwards GG.deals' own rate-limit headers (x-ratelimit-limit/-remaining/
// -reset) onto the response instead of dropping them — the app reads these
// as the authoritative source for how much of the 100/minute + 1000/hour
// API budget is left, rather than reconstructing an approximation of it.
// Access-Control-Expose-Headers is required for this: by default a
// cross-origin fetch() can only read a small safelist of response headers
// (Content-Type etc.) — custom headers like these are invisible to the
// browser's JS unless explicitly exposed here, even though they're present
// on the wire.

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    const url = new URL(request.url);
    const ids = url.searchParams.get('ids') || '';
    const region = url.searchParams.get('region') || 'it';

    if (!ids) {
      return new Response(JSON.stringify({ error: 'Missing ids' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const apiUrl = `https://api.gg.deals/v1/prices/by-steam-app-id/?ids=${ids}&key=${env.GGDEALS_KEY}&region=${region}`;
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://gg.deals/',
      },
    });
    const body = await resp.text();

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Access-Control-Expose-Headers': 'x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset',
    };
    ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'].forEach(h => {
      const v = resp.headers.get(h);
      if (v != null) headers[h] = v;
    });

    return new Response(body, {
      status: resp.status,
      headers,
    });
  },
};
