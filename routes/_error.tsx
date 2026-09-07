import { HttpError } from "fresh";
import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

export default define.page(function ErrorPage(props) {
  const error = props.error;
  const is404 = error instanceof HttpError && error.status === 404;

  return (
    <main class="max-w-[65ch] mx-auto px-5 py-20 text-center">
      <Head>
        <title>
          {is404 ? "404 — 페이지를 찾을 수 없습니다" : "오류가 발생했습니다"}
          {" "}
          — iceship.dev
        </title>
      </Head>
      <h1 class="text-2xl font-bold tracking-tight">
        {is404 ? "페이지를 찾을 수 없습니다 (404)" : "오류가 발생했습니다"}
      </h1>
      <p class="mt-3 text-neutral-600 dark:text-neutral-400">
        {is404
          ? "요청하신 페이지가 존재하지 않거나 주소가 변경되었습니다."
          : "요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."}
      </p>
      <div class="mt-8 flex justify-center gap-4 text-sm">
        <a href="/" class="underline hover:opacity-80">홈으로 →</a>
        <a href="/blog" class="underline hover:opacity-80">블로그 목록 →</a>
      </div>
    </main>
  );
});
