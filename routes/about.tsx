import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

export default define.page(function About() {
  return (
    <main id="main-content" tabIndex={-1} class="site-shell page-content">
      <Head>
        <title>소개 — iceship.dev</title>
      </Head>
      <div class="page-heading">
        <h1>소개</h1>
      </div>
      <div class="prose-blog">
        <p>안녕하세요, iceship입니다.</p>
        <p>
          개발하면서 배운 것, 문제를 해결한 과정, 관심 있는 주제를 기록합니다.
        </p>
        <p>직접 만들고 꾸준히 다듬어가는 개인 블로그입니다.</p>
        <p>
          <a href="mailto:iceship@gmail.com">iceship@gmail.com</a>
        </p>
      </div>
    </main>
  );
});
