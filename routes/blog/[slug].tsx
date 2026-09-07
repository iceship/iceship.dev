import { HttpError } from "fresh";
import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { getPost, getPosts } from "../../utils/posts.ts";
import CodeCopyHandler from "../../islands/CodeCopyHandler.tsx";
export default define.page(async function PostPage(ctx) {
  const slug = ctx.params.slug;
  const post = await getPost(slug);

  if (!post) {
    throw new HttpError(404, `포스트를 찾을 수 없습니다: ${slug}`);
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
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.summary} />
        <meta property="og:type" content="article" />
        <meta
          property="og:url"
          content={`https://iceship.dev/blog/${post.slug}`}
        />
        <meta property="og:image" content="https://iceship.dev/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iceship.dev/og-image.png" />
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
      <div class="mt-2 text-sm text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
        <time dateTime={post.date}>{post.date}</time>
        <span>·</span>
        <span>{post.readingTime}</span>
        {post.tags.length > 0 && (
          <>
            <span>·</span>
            <span>{post.tags.join(", ")}</span>
          </>
        )}
      </div>

      {post.toc.length > 1 && (
        <nav class="my-8 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 text-sm">
          <div class="font-semibold text-neutral-800 dark:text-neutral-200 mb-2.5">
            목차
          </div>
          <ul class="space-y-1.5">
            {post.toc.map((item) => (
              <li
                key={item.id}
                class={item.level === 3
                  ? "ml-4 text-neutral-500 dark:text-neutral-400"
                  : "text-neutral-700 dark:text-neutral-300"}
              >
                <a
                  href={`#${item.id}`}
                  class="hover:underline hover:text-black dark:hover:text-white"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div
        class="prose-blog mt-8"
        // deno-lint-ignore react-no-danger
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />

      <CodeCopyHandler />

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
