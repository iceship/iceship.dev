import { App, staticFiles } from "fresh";
import type { State } from "./utils.ts";

export const app = new App<State>();

app.use(staticFiles());

// 파일 기반 라우트: routes/ 폴더가 자동으로 URL이 됨
app.fsRoutes();
