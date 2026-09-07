import type { PostMeta } from "../utils/posts.ts";

export function PostCard({ post }: { post: PostMeta }) {
  return (
    <article class="post-entry">
      <a href={`/blog/${post.slug}`} class="post-link">
        <div class="post-entry-heading">
          <h2>{post.title}</h2>
          <time dateTime={post.date}>{post.date}</time>
        </div>
        {post.summary && <p>{post.summary}</p>}
      </a>
    </article>
  );
}
