import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { getPost, getPosts } from "../../utils/posts.ts";

export default define.page(async function PostPage(ctx) {
  const slug = ctx.params.slug;
  const post = await getPost(slug);

  if (!post) {
    return (
      <main class="max-w-[65ch] mx-auto px-5 py-20 text-center">
        <h1 class="text-2xl font-bold">글이 없어요</h1>
        <p class="mt-2 text-neutral-500 dark:text-neutral-400">
          <code>{slug}</code>에 해당하는 포스트를 찾을 수 없습니다.
        </p>
        <a href="/blog" class="mt-6 inline-block underline">목록으로 →</a>
      </main>
    );
  }

  // 이전/다음 글
  const all = await getPosts();
  const idx = all.findIndex((p) => p.slug === slug);
  const prev = idx > 0 ? all[idx - 1] : null;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;

  return (
    <main class="max-w-[65ch] mx-auto px-5 py-10">
      <Head>
        <title>{post.title} — iceship.dev</title>
        <meta name="description" content={post.summary} />
      </Head>

      <a
        href="/blog"
        class="text-sm text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white"
      >
        ← 목록
      </a>

      <h1 class="mt-4 text-3xl font-bold tracking-tight leading-tight">
        {post.title}
      </h1>
      <div class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {post.date}
        {post.tags.length > 0 && ` · ${post.tags.join(", ")}`}
      </div>

      <div
        class="prose-blog mt-8"
        // deno-lint-ignore no-explicit-any react-no-danger
        dangerouslySetInnerHTML={{ __html: post.contentHtml } as any}
      />

      <nav class="mt-16 pt-6 border-t border-neutral-200 dark:border-neutral-800 flex justify-between text-sm">
        <span>
          {prev && (
            <a href={`/blog/${prev.slug}`} class="hover:underline">
              ← {prev.title}
            </a>
          )}
        </span>
        <span>
          {next && (
            <a href={`/blog/${next.slug}`} class="hover:underline">
              {next.title} →
            </a>
          )}
        </span>
      </nav>
    </main>
  );
});
