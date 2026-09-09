import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";
import { cachePartialResponse } from "./utils/navigation.ts";

export const app = new App<State>();

// 보안 헤더 및 정적 에셋 고속 캐싱 미들웨어
app.use(async (ctx) => {
  const resp = await ctx.next();
  cachePartialResponse(ctx.req, resp);
  resp.headers.set("X-Content-Type-Options", "nosniff");
  resp.headers.set("X-Frame-Options", "DENY");
  resp.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resp.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  // 정적 에셋 캐싱 최적화 (브라우저 및 Cloudflare CDN 엣지 캐시 극대화)
  if (resp.status === 200) {
    const pathname = ctx.url.pathname;
    if (
      pathname.startsWith("/images/") ||
      pathname.startsWith("/favicon") ||
      pathname === "/site.webmanifest" ||
      pathname.startsWith("/apple-touch-icon") ||
      pathname.startsWith("/web-app-manifest")
    ) {
      resp.headers.set(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=604800",
      );
    } else if (pathname.startsWith("/assets/")) {
      resp.headers.set(
        "Cache-Control",
        "public, max-age=31536000, immutable",
      );
    }
  }

  return resp;
});

// /posts 경로 301 영구 리디렉션 미들웨어 (트레일링 슬래시 / 및 쿼리스트링 자동 처리)
app.use(async (ctx) => {
  const pathname = ctx.url.pathname;
  if (pathname === "/posts" || pathname === "/posts/") {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `/blog${ctx.url.search}`,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  }
  if (pathname.startsWith("/posts/")) {
    let slug = pathname.slice("/posts/".length).replace(/\/+$/, "");
    if (slug === "typescript-node.js-init") {
      slug = "typescript-node-js-init";
    }
    const safeSlug = encodeURIComponent(slug);
    return new Response(null, {
      status: 301,
      headers: {
        Location: `/blog/${safeSlug}${ctx.url.search}`,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  }
  return await ctx.next();
});

app.use(staticFiles());

// 파일 기반 라우트: routes/ 폴더가 자동으로 URL이 됨
app.fsRoutes();
