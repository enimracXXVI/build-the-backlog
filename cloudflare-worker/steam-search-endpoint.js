// Deployable source for the steam-proxy Cloudflare Worker
// (https://steam-proxy-cm26.carmine-migliore26.workers.dev).
// Handles both `?appid=<id>` (existing single-game lookup) and
// `?search=<term>` (title search, used by the app's "Store link" field
// to find an App ID without leaving the app).

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    };

    const search = url.searchParams.get("search");
    if (search) {
      const res = await fetch(
        `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(search)}&l=english&cc=it`
      );
      const data = await res.json();
      return Response.json(data, { headers });
    }

    const id = url.searchParams.get("appid");
    if (!id) {
      return new Response("Missing ?appid= or ?search= parameter", { status: 400 });
    }

    const res = await fetch(
      `https://store.steampowered.com/api/appdetails/?cc=italian&l=english&appids=${id}`
    );
    const data = await res.json();

    return Response.json(data, { headers });
  }
};
