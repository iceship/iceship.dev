import { define } from "../../utils.ts";
import { getPosts } from "../../utils/posts.ts";

export const handler = define.handlers({
  async GET() {
    const posts = await getPosts();
    const searchData = posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      tags: post.tags,
      date: post.date,
    }));

    return Response.json(searchData, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  },
});
