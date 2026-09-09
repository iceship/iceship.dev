import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET(ctx) {
    let slug = ctx.params.slug;

    // 예전 블로그에서 파일명에 .js가 포함되었던 특수 케이스 처리
    if (slug === "typescript-node.js-init") {
      slug = "typescript-node-js-init";
    }

    // 오픈 리디렉션 및 경로 탐색 방지를 위한 안전한 인코딩
    const safeSlug = encodeURIComponent(slug);

    return new Response(null, {
      status: 301,
      headers: {
        Location: `/blog/${safeSlug}`,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  },
});
