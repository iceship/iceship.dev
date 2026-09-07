import { join } from "@std/path";
import { parsePostSource, postFileError } from "../utils/post-source.ts";

export async function validatePosts(directory: string) {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        files.push(join(directory, entry.name));
      }
    }
  } catch (error) {
    throw postFileError(directory, error);
  }
  files.sort();
  const results = await Promise.allSettled(files.map(async (file) => {
    try {
      parsePostSource(await Deno.readTextFile(file), file);
    } catch (error) {
      throw postFileError(file, error);
    }
  }));
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [String(result.reason.message)] : []
  );
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
