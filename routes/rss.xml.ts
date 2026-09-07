import { define } from "../utils.ts";
import { getPosts } from "../utils/posts.ts";

const SITE_URL = "https://iceship.dev";
const SITE_TITLE = "iceship.dev";
const SITE_DESC = "iceship의 미니멀 개인 블로그";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safePubDate(dateStr: string): string {
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

export const handler = define.handlers({
  async GET() {
    const posts = await getPosts();
    const items = posts.map((p) => `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${safePubDate(p.date)}</pubDate>
      <description>${escapeXml(p.summary)}</description>
    </item>`).join("");

    const lastBuildDate = posts.length > 0
      ? safePubDate(posts[0].date)
      : new Date().toUTCString();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${SITE_TITLE}</title>
  <link>${SITE_URL}</link>
  <description>${SITE_DESC}</description>
  <language>ko</language>
  <lastBuildDate>${lastBuildDate}</lastBuildDate>
  <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />
  ${items}
</channel>
</rss>`;

    return new Response(xml, {
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
  },
});
