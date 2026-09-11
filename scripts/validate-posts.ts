import { basename, join } from "@std/path";
import { parsePostSource, postFileError } from "../utils/post-source.ts";

export async function validatePosts(directory: string) {
  const files: string[] = [];

  async function walk(currentDir: string) {
    for await (const entry of Deno.readDir(currentDir)) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory) {
        await walk(fullPath);
      } else if (entry.isFile && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  try {
    await walk(directory);
  } catch (error) {
    throw postFileError(directory, error);
  }

  files.sort();

  const seenSlugs = new Map<string, string>();
  const duplicateErrors: string[] = [];
  for (const file of files) {
    const slug = basename(file, ".md");
    const existing = seenSlugs.get(slug);
    if (existing) {
      duplicateErrors.push(
        `${file}: 중복된 slug "${slug}"가 발견되었습니다 (이미 "${existing}"에서 사용 중)`,
      );
    } else {
      seenSlugs.set(slug, file);
    }
  }

  const results = await Promise.allSettled(files.map(async (file) => {
    try {
      parsePostSource(await Deno.readTextFile(file), file);
    } catch (error) {
      throw postFileError(file, error);
    }
  }));
  const parseErrors = results.flatMap((result) =>
    result.status === "rejected" ? [String(result.reason.message)] : []
  );

  const errors = [...duplicateErrors, ...parseErrors].sort();
  return { count: files.length, errors };
}

if (import.meta.main) {
  try {
    const { count, errors } = await validatePosts(Deno.args[0] ?? "posts");
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      console.error(`${count}개 글 중 ${errors.length}개 검증 실패`);
      Deno.exitCode = 1;
    } else {
      console.log(`${count}개 글 검증 완료`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
