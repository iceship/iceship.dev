import { join } from "@std/path";
import sharp from "npm:sharp@^0.35.4";

const IMAGES_DIR = join(Deno.cwd(), "static", "images", "blog");
const POSTS_DIR = join(Deno.cwd(), "posts");
const MAX_WIDTH = 1400; // 블로그 본문 레티나(2x) 대응 최대 가로 너비
const WEBP_QUALITY = 82; // 시각적 손실 없이 높은 압축률을 제공하는 최적 퀄리티

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface ConversionResult {
  oldName: string;
  newName: string;
  oldSize: number;
  newSize: number;
}

async function optimizeImages() {
  console.log("🔍 static/images/blog/ 폴더의 이미지 탐색 중...\n");

  const eligibleFiles: string[] = [];
  try {
    for await (const entry of Deno.readDir(IMAGES_DIR)) {
      if (entry.isFile && /\.(png|jpe?g)$/i.test(entry.name)) {
        eligibleFiles.push(entry.name);
      }
    }
  } catch (err) {
    console.error(`❌ 이미지 폴더 접근 실패: ${IMAGES_DIR}`, err);
    return;
  }

  if (eligibleFiles.length === 0) {
    console.log("✨ 최적화할 새로운 PNG/JPG 이미지가 없습니다.");
    console.log("   (모든 이미지가 이미 WebP 포맷으로 최적화되어 있습니다)");
    return;
  }

  console.log(
    `총 ${eligibleFiles.length}개의 이미지 발견. 최적화 및 WebP 변환 시작...\n`,
  );

  const results: ConversionResult[] = [];

  for (const file of eligibleFiles) {
    const inputPath = join(IMAGES_DIR, file);
    const baseName = file.replace(/\.(png|jpe?g)$/i, "");
    const webpName = `${baseName}.webp`;
    const outputPath = join(IMAGES_DIR, webpName);

    try {
      const fileInfo = await Deno.stat(inputPath);
      const oldSize = fileInfo.size;

      const instance = sharp(inputPath);
      const meta = await instance.metadata();

      let pipeline = sharp(inputPath);
      if (meta.width && meta.width > MAX_WIDTH) {
        pipeline = pipeline.resize(MAX_WIDTH, null, {
          withoutEnlargement: true,
        });
      }

      await pipeline
        .webp({ quality: WEBP_QUALITY, effort: 6 })
        .toFile(outputPath);

      const newFileInfo = await Deno.stat(outputPath);
      const newSize = newFileInfo.size;

      // 원본 파일 삭제 (동일 파일명이 아닐 때만)
      if (inputPath !== outputPath) {
        await Deno.remove(inputPath);
      }

      const ratio = (((oldSize - newSize) / oldSize) * 100).toFixed(1);
      console.log(
        `📦 ${file} (${formatBytes(oldSize)}) ➡️ ${webpName} (${
          formatBytes(newSize)
        }) [-${ratio}%]`,
      );

      results.push({
        oldName: file,
        newName: webpName,
        oldSize,
        newSize,
      });
    } catch (err) {
      console.error(`❌ ${file} 처리 중 오류 발생:`, err);
    }
  }

  // posts/*.md 파일 내 이미지 경로 자동 교체
  console.log("\n📝 마크다운(posts/*.md) 내 이미지 링크 업데이트 중...");
  let updatedPostCount = 0;

  try {
    for await (const entry of Deno.readDir(POSTS_DIR)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        const postPath = join(POSTS_DIR, entry.name);
        let content = await Deno.readTextFile(postPath);
        let changed = false;

        for (const res of results) {
          if (content.includes(res.oldName)) {
            content = content.replaceAll(res.oldName, res.newName);
            changed = true;
          }
        }

        if (changed) {
          await Deno.writeTextFile(postPath, content);
          console.log(`  ✓ ${entry.name} 경로 갱신됨`);
          updatedPostCount++;
        }
      }
    }
  } catch (err) {
    console.error("❌ 마크다운 파일 갱신 중 오류:", err);
  }

  // 총 결과 요약
  const totalOld = results.reduce((acc, r) => acc + r.oldSize, 0);
  const totalNew = results.reduce((acc, r) => acc + r.newSize, 0);
  const totalSaved = totalOld - totalNew;
  const totalRatio = (((totalOld - totalNew) / totalOld) * 100).toFixed(1);

  console.log("\n==========================================");
  console.log(`🎉 이미지 최적화 완료!`);
  console.log(`- 변환된 이미지: ${results.length}개`);
  console.log(`- 갱신된 글: ${updatedPostCount}개`);
  console.log(
    `- 용량 절감: ${formatBytes(totalOld)} ➡️ ${formatBytes(totalNew)} (총 ${
      formatBytes(totalSaved)
    } 절약, -${totalRatio}%)`,
  );
  console.log("==========================================\n");
}

if (import.meta.main) {
  await optimizeImages();
}
