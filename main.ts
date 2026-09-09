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

app.use(staticFiles());

// 파일 기반 라우트: routes/ 폴더가 자동으로 URL이 됨
app.fsRoutes();
