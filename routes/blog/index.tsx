import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { getPosts } from "../../utils/posts.ts";
import { PostCard } from "../../components/PostCard.tsx";

export default define.page(async function BlogIndex(ctx) {
  const tag = ctx.url.searchParams.get("tag");
  const all = await getPosts();
  const posts = tag ? all.filter((p) => p.tags.includes(tag)) : all;
  const tags = [...new Set(all.flatMap((p) => p.tags))].sort();

  return (
    <main id="main-content" tabIndex={-1} class="site-shell page-content">
      <Head>
        <title>{tag ? `#${tag} — ` : ""}글 — iceship.dev</title>
      </Head>
      <div class="page-heading">
        <h1>글</h1>
        <p>{posts.length}개의 기록</p>
      </div>
      {tags.length > 0 && (
        <nav class="tag-filter" aria-label="태그로 글 필터링">
          <a href="/blog" aria-current={!tag ? "page" : undefined}>전체</a>
          {tags.map((t) => (
            <a
              key={t}
              href={`/blog?tag=${encodeURIComponent(t)}`}
              aria-current={tag === t ? "page" : undefined}
            >
              #{t}
            </a>
          ))}
        </nav>
      )}
      {posts.length === 0 && (
        <p class="empty-state">
          해당하는 글이 없습니다. <a href="/blog">전체 글 보기</a>
        </p>
      )}
      {posts.map((post) => <PostCard key={post.slug} post={post} />)}
    </main>
  );
});
