import { extractYaml } from "@std/front-matter";

export interface PostFields {
  title: string;
  date: string;
  summary: string;
  tags: string[];
}

export class PostValidationError extends Error {
  constructor(file: string, issues: string[]) {
    super(`${file}: ${issues.join("; ")}`);
    this.name = "PostValidationError";
  }
}

/** Shared by runtime loading and pre-build validation. Dates must be quoted YAML strings. */
export function parsePostSource(
  raw: string,
  file: string,
): { fields: PostFields; body: string } {
  let extracted;
  try {
    extracted = extractYaml<unknown>(raw);
  } catch (error) {
    throw new PostValidationError(file, [
      `YAML front-matter를 읽을 수 없습니다: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }
  const { attrs, body } = extracted;
  if (attrs === null || typeof attrs !== "object" || Array.isArray(attrs)) {
    throw new PostValidationError(file, [
      "front-matter는 키와 값으로 작성해야 합니다",
    ]);
  }
  const values = attrs as Record<string, unknown>;
  const issues: string[] = [];
  const text = (key: "title" | "summary") => {
    const value = values[key];
    if (typeof value !== "string" || value.trim() === "") {
      issues.push(`${key}: 비어 있지 않은 문자열이 필요합니다`);
      return "";
    }
    return value.trim();
  };
  const title = text("title");
  const summary = text("summary");
  const date = values.date;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date.startsWith("0000-") ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  ) {
    issues.push(
      'date: 실제로 존재하는 날짜를 "YYYY-MM-DD" 형식의 문자열로 작성하세요',
    );
  }
  let tags: string[] = [];
  if (values.tags !== undefined) {
    if (
      !Array.isArray(values.tags) ||
      values.tags.some((tag) => typeof tag !== "string" || tag.trim() === "")
    ) {
      issues.push("tags: 비어 있지 않은 문자열 배열이 필요합니다 (생략 가능)");
    } else {
      tags = [...new Set(values.tags.map((tag: string) => tag.trim()))];
    }
  }
  if (issues.length > 0) throw new PostValidationError(file, issues);
  return { fields: { title, summary, date: date as string, tags }, body };
}

/** Newest first; ties use code-point slug order, independent of host locale. */
export function comparePosts(
  a: { date: string; slug: string },
  b: { date: string; slug: string },
): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

export function postFileError(file: string, error: unknown): Error {
  if (error instanceof PostValidationError) return error;
  return new Error(
    `${file}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}
