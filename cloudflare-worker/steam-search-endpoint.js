// Deployable source for the steam-proxy Cloudflare Worker
// (https://steam-proxy-cm26.carmine-migliore26.workers.dev).
// Handles both `?appid=<id>` (existing single-game lookup) and
// `?search=<term>` (title search, used by the app's "Store link" field
// to find an App ID without leaving the app).

async function fetchUpstream(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    let json = null;
    if (res.ok) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }
    return { status: res.status, json };
  } catch {
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    };

    const search = url.searchParams.get("search");
    if (search) {
      const { json } = await fetchUpstream(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(search)}&l=english&cc=it`
      );
      return Response.json(json || { items: [] }, { headers });
    }

    const id = url.searchParams.get("appid");
    if (!id) {
      return new Response("Missing ?appid= or ?search= parameter", { status: 400 });
    }

    const { status, json } = await fetchUpstream(
      `https://store.steampowered.com/api/appdetails/?cc=it&l=english&appids=${id}`
    );
    // _httpStatus lets the app tell a real Steam rate-limit/block (429/403)
    // apart from "this game genuinely isn't on Steam" (success:false with a
    // 200), so a batch check can stop early instead of burning through every
    // remaining game as a fake permanent failure.
    return Response.json(
      json || { [id]: { success: false, _httpStatus: status } },
      { headers }
    );
  }
};
