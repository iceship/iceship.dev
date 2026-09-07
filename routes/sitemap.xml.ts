import { define } from "../utils.ts";
import { getPosts } from "../utils/posts.ts";

const SITE_URL = "https://iceship.dev";

export const handler = define.handlers({
  async GET() {
    const posts = await getPosts();

    const staticPages = [
      { loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" },
      { loc: `${SITE_URL}/blog`, changefreq: "daily", priority: "0.9" },
      { loc: `${SITE_URL}/about`, changefreq: "monthly", priority: "0.5" },
    ];

    const postPages = posts.map((p) => ({
      loc: `${SITE_URL}/blog/${p.slug}`,
      lastmod: p.date,
      changefreq: "weekly",
      priority: "0.8",
    }));

    const urls = [...staticPages, ...postPages]
      .map(
        (entry) => `
  <url>
    <loc>${entry.loc}</loc>
    ${"lastmod" in entry ? `<lastmod>${entry.lastmod}</lastmod>` : ""}
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
      )
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  },
});
