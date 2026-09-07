import { deepEqual, equal, match, rejects, throws } from "node:assert/strict";
import { join } from "@std/path";
import {
  comparePosts,
  parsePostSource,
  PostValidationError,
} from "../utils/post-source.ts";
import { validatePosts } from "../scripts/validate-posts.ts";

function source(fields: Record<string, unknown> = {}) {
  // JSON values are valid YAML and preserve the date's string type.
  return `---\n${
    Object.entries({
      title: "테스트 글",
      date: "2024-02-29",
      summary: "한 줄 요약",
      ...fields,
    }).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")
  }\n---\n\n본문\n`;
}

Deno.test("valid metadata preserves body and normalizes optional tags", () => {
  const result = parsePostSource(
    source({ title: " 제목 ", tags: [" deno ", "deno", "C++"] }),
    "posts/valid.md",
  );
  deepEqual(result.fields, {
    title: "제목",
    date: "2024-02-29",
    summary: "한 줄 요약",
    tags: ["deno", "C++"],
  });
  match(result.body, /본문/);
  deepEqual(parsePostSource(source(), "posts/no-tags.md").fields.tags, []);
});

Deno.test("required fields reject missing, blank and non-string values", () => {
  for (const field of ["title", "summary", "date"]) {
    for (const value of [null, "", "   ", 123, [], {}]) {
      throws(
        () => parsePostSource(source({ [field]: value }), "posts/bad.md"),
        (error: unknown) =>
          error instanceof PostValidationError &&
          error.message.includes("posts/bad.md") &&
          error.message.includes(field),
      );
    }
    const raw = source().split("\n").filter((line) =>
      !line.startsWith(`${field}:`)
    ).join("\n");
    throws(() => parsePostSource(raw, "posts/missing.md"), new RegExp(field));
  }
});

Deno.test("calendar validation rejects rollover dates and accepts leap years", () => {
  for (
    const date of [
      "2023-02-29",
      "2024-02-30",
      "2026-04-31",
      "2026-00-01",
      "2026-13-01",
      "2026-01-00",
      "2026-9-07",
      "0000-01-01",
      "2026-09-07T00:00:00Z",
    ]
  ) {
    throws(
      () => parsePostSource(source({ date }), "posts/date.md"),
      /posts\/date.md:.*date/,
    );
  }
  for (const date of ["2000-02-29", "2024-02-29", "2026-09-07"]) {
    equal(parsePostSource(source({ date }), "posts/date.md").fields.date, date);
  }
});

Deno.test("invalid tags are rejected instead of coerced", () => {
  for (const tags of ["deno", [1], [""], ["  "], null]) {
    throws(
      () => parsePostSource(source({ tags }), "posts/tags.md"),
      /posts\/tags.md:.*tags/,
    );
  }
});

Deno.test("malformed or missing YAML reports the filename", () => {
  for (
    const raw of [
      "본문만 있습니다",
      "---\ntitle: [\n---\n본문",
      "---\n- item\n---\n본문",
    ]
  ) {
    throws(() => parsePostSource(raw, "posts/broken.md"), /posts\/broken.md:/);
  }
});

Deno.test("date ties have stable slug order and identical entries compare equal", () => {
  const posts = [
    { date: "2026-09-07", slug: "z" },
    { date: "2026-09-06", slug: "old" },
    { date: "2026-09-07", slug: "a" },
  ];
  deepEqual([...posts].sort(comparePosts).map((p) => p.slug), [
    "a",
    "z",
    "old",
  ]);
  deepEqual([...posts].reverse().sort(comparePosts).map((p) => p.slug), [
    "a",
    "z",
    "old",
  ]);
  equal(comparePosts(posts[0], posts[0]), 0);
});

Deno.test("pre-build validation reports every bad file in filename order", async () => {
  const dir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(join(dir, "valid.md"), source());
    await Deno.writeTextFile(join(dir, "z.md"), source({ title: "" }));
    await Deno.writeTextFile(join(dir, "a.md"), source({ date: "2026-02-30" }));
    await Deno.writeTextFile(join(dir, "notes.txt"), "not a post");
    const result = await validatePosts(dir);
    equal(result.count, 3);
    equal(result.errors.length, 2);
    match(result.errors[0], /a.md:.*date/);
    match(result.errors[1], /z.md:.*title/);
    await rejects(() => validatePosts(join(dir, "missing")), /missing/);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("runtime keeps bad posts visible as errors and missing posts as 404 candidates", async () => {
  const dir = await Deno.makeTempDir();
  const originalDir = Deno.cwd();
  try {
    await Deno.mkdir(join(dir, "posts"));
    Deno.chdir(dir);
    // Resolve the runtime's cwd-based posts directory against an isolated fixture.
    const { getPosts, getPost } = await import("../utils/posts.ts");
    deepEqual(await getPosts(), []);
    equal(await getPost("missing"), null);
    await Deno.writeTextFile(join(dir, "posts", "z.md"), source());
    await Deno.writeTextFile(join(dir, "posts", "a.md"), source());
    deepEqual((await getPosts()).map((p) => p.slug), ["a", "z"]);
    equal((await getPost("a"))?.title, "테스트 글");
    await Deno.writeTextFile(
      join(dir, "posts", "broken.md"),
      source({ summary: "" }),
    );
    await rejects(() => getPosts(), /broken.md:.*summary/);
    await rejects(() => getPost("broken"), /broken.md:.*summary/);
    // An existing directory at a post path is an I/O error, not a missing post.
    await Deno.mkdir(join(dir, "posts", "directory.md"));
    await rejects(() => getPost("directory"), /directory.md:/);
    await Deno.rename(join(dir, "posts"), join(dir, "moved"));
    await rejects(() => getPosts(), /posts:/);
  } finally {
    Deno.chdir(originalDir);
    await Deno.remove(dir, { recursive: true });
  }
});
