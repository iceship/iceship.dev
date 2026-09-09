import { HttpError } from "fresh";
import { Head } from "fresh/runtime";
import { define } from "../../utils.ts";
import { getPost, getPosts } from "../../utils/posts.ts";
import CodeCopyHandler from "../../islands/CodeCopyHandler.tsx";
import TocActiveHandler from "../../islands/TocActiveHandler.tsx";

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
    <main
      id="main-content"
      tabIndex={-1}
      class="site-shell page-content relative"
    >
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

      <h1 class="post-title">
        {post.title}
      </h1>
      <div class="post-meta">
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

      {post.toc.length >= 2 && (
        <>
          <details class="post-toc group/toc xl:hidden">
            <summary class="font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer select-none flex items-center justify-between">
              <span>목차</span>
              <span class="text-xs text-neutral-400 transition-transform group-open/toc:rotate-180">
                ▼
              </span>
            </summary>
            <ul class="mt-3 space-y-1.5 pt-2 border-t border-neutral-200/60 dark:border-neutral-800">
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
          </details>

          <aside class="post-toc-sidebar" aria-label="목차">
            <div class="post-toc-sticky">
              <p class="post-toc-title">목차</p>
              <nav class="post-toc-nav">
                <ul class="post-toc-list">
                  {post.toc.map((item) => (
                    <li
                      key={item.id}
                      class={item.level === 3
                        ? "post-toc-item level-3"
                        : "post-toc-item level-2"}
                    >
                      <a
                        href={`#${item.id}`}
                        class="post-toc-link"
                        data-toc-id={item.id}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>
        </>
      )}

      <div
        class="prose-blog post-body"
        // deno-lint-ignore react-no-danger
        dangerouslySetInnerHTML={{ __html: post.contentHtml }}
      />

      <CodeCopyHandler />
      <TocActiveHandler />

      <nav class="post-pagination" aria-label="다른 글">
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
