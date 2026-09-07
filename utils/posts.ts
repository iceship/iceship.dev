import { extractYaml } from "@std/front-matter";
import { marked } from "marked";

export interface PostMeta {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  tags: string[];
  summary: string;
}

export interface Post extends PostMeta {
  /** 렌더링된 HTML */
  contentHtml: string;
}

const POSTS_DIR = new URL("../posts/", import.meta.url);

async function readSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  for await (const entry of Deno.readDir(POSTS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".md")) {
      slugs.push(entry.name.replace(/\.md$/, ""));
    }
  }
  return slugs;
}

export async function getPosts(): Promise<PostMeta[]> {
  const slugs = await readSlugs();
  const posts: PostMeta[] = [];

  for (const slug of slugs) {
    const raw = await Deno.readTextFile(
      new URL(`../posts/${slug}.md`, import.meta.url),
    );
    const { attrs } = extractYaml<Record<string, unknown>>(raw);
    posts.push({
      slug,
      title: String(attrs.title ?? slug),
      date: String(attrs.date ?? "1970-01-01"),
      tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
      summary: String(attrs.summary ?? ""),
    });
  }

  // 최신순 정렬
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

export async function getPost(slug: string): Promise<Post | null> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(
      new URL(`../posts/${slug}.md`, import.meta.url),
    );
  } catch {
    return null;
  }
  const { attrs, body } = extractYaml<Record<string, unknown>>(raw);
  const contentHtml = await marked.parse(body, { breaks: true });

  return {
    slug,
    title: String(attrs.title ?? slug),
    date: String(attrs.date ?? "1970-01-01"),
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    summary: String(attrs.summary ?? ""),
    contentHtml: typeof contentHtml === "string" ? contentHtml : "",
  };
}
