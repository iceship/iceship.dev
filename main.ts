import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";

export const app = new App<State>();

// 보안 헤더 미들웨어 (MIME 스니핑 방지, 클릭재킹 방지, 리퍼러 보호 등)
app.use(async (ctx) => {
  const resp = await ctx.next();
  resp.headers.set("X-Content-Type-Options", "nosniff");
  resp.headers.set("X-Frame-Options", "DENY");
  resp.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resp.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
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
