import { define } from "../utils.ts";
import { getPosts } from "../utils/posts.ts";

const SITE_URL = "https://iceship.dev";
const SITE_TITLE = "iceship.dev";
const SITE_DESC = "iceship의 미니멀 개인 블로그";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const handler = define.handlers({
  async GET() {
    const posts = await getPosts();
    const items = posts.map((p) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid>${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeXml(p.summary)}</description>
    </item>`).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${SITE_TITLE}</title>
  <link>${SITE_URL}</link>
  <description>${SITE_DESC}</description>
  ${items}
</channel>
</rss>`;

    return new Response(xml, {
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
  },
});
