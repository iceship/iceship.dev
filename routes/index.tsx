import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { getPosts } from "../utils/posts.ts";
import { PostCard } from "../components/PostCard.tsx";

export default define.page(async function Home() {
  const recent = (await getPosts()).slice(0, 5);

  return (
    <main id="main-content" tabIndex={-1} class="site-shell page-content">
      <Head>
        <title>iceship.dev</title>
      </Head>
      <section class="home-intro">
        <h1>배우고, 만들고, 기록합니다.</h1>
        <p>개발하면서 배운 것과 오래 기억하고 싶은 생각을 씁니다.</p>
      </section>
      <section aria-labelledby="recent-posts">
        <div class="section-heading">
          <h2 id="recent-posts">최근 글</h2>
          <a href="/blog">
            전체 보기 <span aria-hidden="true">↗</span>
          </a>
        </div>
        {recent.length === 0 && <p class="empty-state">아직 글이 없습니다.</p>}
        {recent.map((post) => <PostCard key={post.slug} post={post} />)}
      </section>
    </main>
  );
});
