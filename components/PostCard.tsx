import type { PostMeta } from "../utils/posts.ts";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <article class="py-6 border-b border-neutral-200 dark:border-neutral-800 last:border-0">
      <div class="text-sm text-neutral-500 dark:text-neutral-400 mb-1">
        {post.date}
        {post.tags.length > 0 && ` · ${post.tags.join(", ")}`}
      </div>
      <a href={`/blog/${post.slug}`} class="block group">
        <h2 class="text-xl font-semibold tracking-tight group-hover:underline">
          {post.title}
        </h2>
        {post.summary && (
          <p class="mt-1.5 text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {post.summary}
          </p>
        )}
      </a>
    </article>
  );
}
