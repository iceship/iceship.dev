import { extractYaml } from "@std/front-matter";
import { join } from "@std/path";
import { Marked } from "marked";
import Prism from "prismjs";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-jsx.js";
import "prismjs/components/prism-tsx.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-bash.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-css.js";

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const marked = new Marked({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && Prism.languages[lang] ? lang : null;
      const highlighted = language
        ? Prism.highlight(text, Prism.languages[language], language)
        : escapeHtml(text);
      const langClass = language ? ` language-${language}` : "";
      return `<pre class="language-${
        lang || "text"
      }"><code class="${langClass}">${highlighted}</code></pre>\n`;
    },
    link(
      { href, title, text }: {
        href: string;
        title?: string | null;
        text: string;
      },
    ) {
      const isExternal = href.startsWith("http://") ||
        href.startsWith("https://");
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      const externalAttrs = isExternal
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
      return `<a href="${href}"${titleAttr}${externalAttrs}>${text}</a>`;
    },
  },
});

// NOTE: import.meta.url 기준(../posts) 쓰면 `vite build` 후 _fresh/server 번들에서
// 경로가 깨져 Deploy에서 500이 난다. Deno.cwd() = 프로젝트 루트 기준이 안전하다.
const POSTS_DIR = join(Deno.cwd(), "posts");

async function readSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  try {
    for await (const entry of Deno.readDir(POSTS_DIR)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        slugs.push(entry.name.replace(/\.md$/, ""));
      }
    }
  } catch {
    return [];
  }
  return slugs;
}

interface CachedPost {
  mtime: number;
  post: Post;
}

interface CachedMeta {
  mtime: number;
  meta: PostMeta;
}

const postDetailCache = new Map<string, CachedPost>();
const postMetaCache = new Map<string, CachedMeta>();

export async function getPosts(): Promise<PostMeta[]> {
  const slugs = await readSlugs();

  const posts = await Promise.all(
    slugs.map(async (slug) => {
      try {
        const file = join(POSTS_DIR, `${slug}.md`);
        const stat = await Deno.stat(file);
        const mtime = stat.mtime?.getTime() ?? 0;

        const cached = postMetaCache.get(slug);
        if (cached && cached.mtime === mtime) {
          return cached.meta;
        }

        const raw = await Deno.readTextFile(file);
        const { attrs } = extractYaml<Record<string, unknown>>(raw);
        const meta: PostMeta = {
          slug,
          title: String(attrs.title ?? slug),
          date: String(attrs.date ?? "1970-01-01"),
          tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
          summary: String(attrs.summary ?? ""),
        };

        postMetaCache.set(slug, { mtime, meta });
        return meta;
      } catch {
        return null;
      }
    }),
  );

  const validPosts = posts.filter((p): p is PostMeta => p !== null);
  // 최신순 정렬
  validPosts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return validPosts;
}

export async function getPost(slug: string): Promise<Post | null> {
  const file = join(POSTS_DIR, `${slug}.md`);
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(file);
  } catch {
    return null;
  }

  const mtime = stat.mtime?.getTime() ?? 0;
  const cached = postDetailCache.get(slug);
  if (cached && cached.mtime === mtime) {
    return cached.post;
  }

  let raw: string;
  try {
    raw = await Deno.readTextFile(file);
  } catch {
    return null;
  }

  const { attrs, body } = extractYaml<Record<string, unknown>>(raw);
  const contentHtml = await marked.parse(body, { breaks: true });

  const post: Post = {
    slug,
    title: String(attrs.title ?? slug),
    date: String(attrs.date ?? "1970-01-01"),
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    summary: String(attrs.summary ?? ""),
    contentHtml: typeof contentHtml === "string" ? contentHtml : "",
  };

  postDetailCache.set(slug, { mtime, post });
  return post;
}
