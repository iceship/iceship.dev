import {
  comparePosts,
  parsePostSource,
  postFileError,
  PostValidationError,
} from "./post-source.ts";
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
        // javascript:, data:, vbscript: 등 위험한 프로토콜 차단
        const sanitizedHref = /^(?:https?:\/\/|\/|#|mailto:)/i.test(href)
          ? href
          : "#";
        const isExternal = sanitizedHref.startsWith("http://") ||
          sanitizedHref.startsWith("https://");
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        const externalAttrs = isExternal
          ? ' target="_blank" rel="noopener noreferrer"'
          : "";
        return `<a href="${
          escapeHtml(sanitizedHref)
        }"${titleAttr}${externalAttrs}>${text}</a>`;
      },
      image({ href, title, text }: {
        href: string;
        title?: string | null;
        text: string;
      }) {
        const sanitizedHref = /^(?:https?:\/\/|\/)/i.test(href) ? href : "";
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        const altText = escapeHtml(text);
        const caption = altText
          ? `<figcaption class="image-caption">${altText}</figcaption>`
          : "";
        return `<figure class="post-figure"><img src="${
          escapeHtml(sanitizedHref)
        }" alt="${altText}"${titleAttr} loading="lazy" decoding="async" class="post-image" />${caption}</figure>\n`;
      },
    },
  });

  const contentHtml = await marked.parse(body, { breaks: false });
  return {
    contentHtml: typeof contentHtml === "string" ? contentHtml : "",
    toc,
  };
}

// NOTE: import.meta.url 기준(../posts) 쓰면 `vite build` 후 _fresh/server 번들에서
// 경로가 깨져 Deploy에서 500이 난다. Deno.cwd() = 프로젝트 루트 기준이 안전하다.
function getPostsDir(): string {
  return join(Deno.cwd(), "posts");
}

export interface PostFileEntry {
  slug: string;
  filePath: string;
}

let slugPathCache: Map<string, string> | null = null;

export async function readPostEntries(
  dir: string = getPostsDir(),
): Promise<PostFileEntry[]> {
  const entries: PostFileEntry[] = [];
  const seen = new Map<string, string>();

  async function walk(currentDir: string) {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        const slug = entry.name.replace(/\.md$/, "");
        const existing = seen.get(slug);
        if (existing) {
          throw new PostValidationError(fullPath, [
            `중복된 slug "${slug}"가 발견되었습니다. 이미 "${existing}"에서 사용 중입니다.`,
          ]);
        }
        seen.set(slug, fullPath);
        entries.push({ slug, filePath: fullPath });
      }
    }
  }

  try {
    await walk(dir);
  } catch (error) {
    throw postFileError(dir, error);
  }

  if (dir === getPostsDir()) {
    slugPathCache = seen;
  }

  return entries;
}

async function findPostFile(slug: string): Promise<string | null> {
  const postsDir = getPostsDir();

  // 1. 루트에 직접 존재하는지 먼저 확인 (디렉토리 에러 유도 포함)
  const rootCandidate = join(postsDir, `${slug}.md`);
  try {
    const stat = await Deno.stat(rootCandidate);
    if (!stat.isDirectory) {
      return rootCandidate;
    }
    // 디렉토리인 경우 readTextFile 단계에서 에러가 발생하도록 반환
    return rootCandidate;
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) {
      throw postFileError(rootCandidate, error);
    }
  }

  // 2. 캐시된 slugPathCache 확인
  if (slugPathCache && slugPathCache.has(slug)) {
    return slugPathCache.get(slug)!;
  }

  // 3. 캐시가 없거나 미스된 경우 재귀 스캔 수행
  try {
    await readPostEntries(postsDir);
    if (slugPathCache && slugPathCache.has(slug)) {
      return slugPathCache.get(slug)!;
    }
  } catch (error) {
    if (error instanceof PostValidationError) throw error;
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }

  return null;
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
  const entries = await readPostEntries();

  const posts = await Promise.all(
    entries.map(async ({ slug, filePath }) => {
      try {
        const stat = await Deno.stat(filePath);
        const mtime = stat.mtime?.getTime() ?? 0;

        const cached = postMetaCache.get(slug);
        if (cached && cached.mtime === mtime) {
          return cached.meta;
        }

        const raw = await Deno.readTextFile(filePath);
        const { fields, body } = parsePostSource(raw, filePath);
        const meta: PostMeta = {
          slug,
          ...fields,
          readingTime: calculateReadingTime(body),
        };

        postMetaCache.set(slug, { mtime, meta });
        return meta;
      } catch (error) {
        throw postFileError(filePath, error);
      }
    }),
  );

  return posts.sort(comparePosts);
}

export async function getPost(slug: string): Promise<Post | null> {
  // 경로 조작(Directory Traversal: .., /, \) 방지
  if (
    !slug ||
    slug.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("\0")
  ) {
    return null;
  }

  const file = await findPostFile(slug);
  if (!file) return null;

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(file);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw postFileError(file, error);
  }

  const mtime = stat.mtime?.getTime() ?? 0;
  const cached = postDetailCache.get(slug);
  if (cached && cached.mtime === mtime) {
    return cached.post;
  }

  let raw: string;
  try {
    raw = await Deno.readTextFile(file);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw postFileError(file, error);
  }

  const { fields, body } = parsePostSource(raw, file);
  const { contentHtml, toc } = await renderMarkdown(body);

  const post: Post = {
    slug,
    ...fields,
    readingTime: calculateReadingTime(body),
    contentHtml,
    toc,
  };

  postDetailCache.set(slug, { mtime, post });
  return post;
}
