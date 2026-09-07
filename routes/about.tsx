import { Head } from "fresh/runtime";
import { define } from "../utils.ts";

export default define.page(function About() {
  return (
    <main class="max-w-[65ch] mx-auto px-5 py-10">
      <Head>
        <title>About — iceship.dev</title>
      </Head>
      <h1 class="text-2xl font-bold tracking-tight">About</h1>
      <p class="mt-4 text-neutral-600 dark:text-neutral-400 leading-relaxed">
        Deno Fresh로 운영하는 미니멀 개인 블로그입니다. 관심사, 배운 것, 삽질
        기록을 남깁니다.
      </p>
      <ul class="mt-6 space-y-2 text-neutral-700 dark:text-neutral-300">
        <li>
          ✉️ Email:{" "}
          <a href="mailto:iceship@gmail.com" class="underline">
            iceship@gmail.com
          </a>
        </li>
        <li>
          🐙 GitHub:{" "}
          <a
            href="https://github.com/iceship"
            target="_blank"
            rel="noopener noreferrer"
            class="underline"
          >
            github.com/iceship
          </a>
        </li>
      </ul>
    </main>
  );
});
