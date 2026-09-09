import { define } from "../../utils.ts";

export const handler = define.handlers({
  GET() {
    return new Response(null, {
      status: 301,
      headers: {
        Location: "/blog",
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
      },
    });
  },
});
