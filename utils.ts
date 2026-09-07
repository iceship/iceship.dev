import { createDefine } from "fresh";

// ctx.state를 공유할 때 쓰는 타입. 지금은 비워둔다.
// deno-lint-ignore no-empty-interface
export interface State {}

export const define = createDefine<State>();
