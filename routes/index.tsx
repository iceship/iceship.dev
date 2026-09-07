import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { getPosts } from "../utils/posts.ts";
import { PostCard } from "../components/PostCard.tsx";

export default define.page(async function Home() {
  const posts = await getPosts();
  const recent = posts.slice(0, 5);

  return (
    <main class="max-w-[65ch] mx-auto px-5">
      <Head>
        <title>iceship.dev — 미니멀 블로그</title>
      </Head>

      <section class="py-10">
        <h1 class="text-2xl font-bold tracking-tight">안녕하세요 👋</h1>
        <p class="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Deno Fresh로 운영하는 개인 블로그입니다. 글은 마크다운으로 쓰고
          GitHub에 커밋합니다.
        </p>
      </section>

      <section>
        <div class="flex items-baseline justify-between mb-2">
          <h2 class="text-lg font-bold">최신 글</h2>
          <a
            href="/blog"
            class="text-sm text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white"
          >
            전체 보기 →
          </a>
        </div>
        {recent.length === 0 && (
          <p class="text-neutral-500 dark:text-neutral-400">
            아직 글이 없습니다.
          </p>
        )}
        {recent.map((post) => <PostCard key={post.slug} post={post} />)}
      </section>
    </main>
  );
});
