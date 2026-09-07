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

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  tags: string[];
  summary: string;
  readingTime: string;
}

export interface Post extends PostMeta {
  /** 렌더링된 HTML */
  contentHtml: string;
  /** 목차 목록 (h2, h3) */
  toc: TocItem[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s\uAC00-\uD7A3\u3131-\u3163-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function calculateReadingTime(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  const cjkChars = (clean.match(/[\uAC00-\uD7A3\u4E00-\u9FFF]/g) || []).length;
  const nonCjkWords = clean
    .replace(/[\uAC00-\uD7A3\u4E00-\u9FFF]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  const minutes = Math.ceil(cjkChars / 400 + nonCjkWords / 200);
  return `${Math.max(1, minutes)}분 소요`;
}

async function renderMarkdown(
  body: string,
): Promise<{ contentHtml: string; toc: TocItem[] }> {
  const toc: TocItem[] = [];
  const seenIds = new Map<string, number>();

  const marked = new Marked({
    renderer: {
      heading(
        this: { parser: { parseInline(tokens?: unknown[]): string } },
        { tokens, depth, text }: {
          tokens: unknown[];
          depth: number;
          text: string;
        },
      ) {
        let baseId = slugify(text);
        if (!baseId) baseId = `heading-${depth}`;
        const count = seenIds.get(baseId) ?? 0;
        seenIds.set(baseId, count + 1);
        const id = count > 0 ? `${baseId}-${count}` : baseId;

        if (depth === 2 || depth === 3) {
          toc.push({ id, text, level: depth });
        }

        const innerHtml = this.parser.parseInline(tokens);
        return `<h${depth} id="${id}" class="group flex items-center scroll-mt-20"><span>${innerHtml}</span><a href="#${id}" class="heading-anchor opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 select-none text-base" aria-label="${
          escapeHtml(text)
        } 링크">#</a></h${depth}>\n`;
      },
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang && Prism.languages[lang] ? lang : null;
        const highlighted = language
          ? Prism.highlight(text, Prism.languages[language], language)
          : escapeHtml(text);
        const langClass = language ? ` language-${language}` : "";
        return `<div class="code-block relative group">
<pre class="language-${
          lang || "text"
        }"><code class="${langClass}">${highlighted}</code></pre>
<button type="button" class="code-copy-btn absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-xs px-2 py-1 rounded bg-neutral-800/90 text-neutral-300 hover:text-white border border-neutral-700/80 hover:border-neutral-500 backdrop-blur-sm select-none" data-code="${
          escapeHtml(text)
        }" aria-label="Copy code">Copy</button>
</div>\n`;
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

  const contentHtml = await marked.parse(body, { breaks: true });
  return {
    contentHtml: typeof contentHtml === "string" ? contentHtml : "",
    toc,
  };
}

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
        const { attrs, body } = extractYaml<Record<string, unknown>>(raw);
        const meta: PostMeta = {
          slug,
          title: String(attrs.title ?? slug),
          date: String(attrs.date ?? "1970-01-01"),
          tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
          summary: String(attrs.summary ?? ""),
          readingTime: calculateReadingTime(body),
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
  const { contentHtml, toc } = await renderMarkdown(body);

  const post: Post = {
    slug,
    title: String(attrs.title ?? slug),
    date: String(attrs.date ?? "1970-01-01"),
    tags: Array.isArray(attrs.tags) ? attrs.tags.map(String) : [],
    summary: String(attrs.summary ?? ""),
    readingTime: calculateReadingTime(body),
    contentHtml,
    toc,
  };

  postDetailCache.set(slug, { mtime, post });
  return post;
}
