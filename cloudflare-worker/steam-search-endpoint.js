// Deployable source for the steam-proxy Cloudflare Worker
// (https://steam-proxy-cm26.carmine-migliore26.workers.dev).
// Handles both `?appid=<id>` (existing single-game lookup) and
// `?search=<term>` (title search, used by the app's "Store link" field
// to find an App ID without leaving the app).

async function fetchJson(url, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  } catch {
    return null;
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
      const data = await fetchJson(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(search)}&l=english&cc=it`
      );
      return Response.json(data || { items: [] }, { headers });
    }

    const id = url.searchParams.get("appid");
    if (!id) {
      return new Response("Missing ?appid= or ?search= parameter", { status: 400 });
    }

    const data = await fetchJson(
      `https://store.steampowered.com/api/appdetails/?cc=it&l=english&appids=${id}`
    );

    return Response.json(data || { [id]: { success: false } }, { headers });
  }
};
