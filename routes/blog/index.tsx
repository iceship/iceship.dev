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
    <main class="max-w-[65ch] mx-auto px-5 py-10">
      <Head>
        <title>{tag ? `#${tag} — ` : ""}Blog — iceship.dev</title>
      </Head>

      <h1 class="text-2xl font-bold tracking-tight mb-2">Blog</h1>
      <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        총 {posts.length}개의 글
      </p>

      {tags.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-8">
          <a
            href="/blog"
            class={`text-sm px-3 py-1 rounded-full border ${
              !tag
                ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                : "border-neutral-300 dark:border-neutral-700 hover:border-black dark:hover:border-white"
            }`}
          >
            전체
          </a>
          {tags.map((t) => (
            <a
              key={t}
              href={`/blog?tag=${t}`}
              class={`text-sm px-3 py-1 rounded-full border ${
                tag === t
                  ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white"
                  : "border-neutral-300 dark:border-neutral-700 hover:border-black dark:hover:border-white"
              }`}
            >
              #{t}
            </a>
          ))}
        </div>
      )}

      {posts.map((post) => <PostCard key={post.slug} post={post} />)}
    </main>
  );
});
