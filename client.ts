// Import CSS files here for hot module reloading to work.
import "./assets/styles.css";
import { installNavigationPrefetch } from "./utils/navigation-prefetch.ts";

const cleanup = installNavigationPrefetch();
if (import.meta.hot) import.meta.hot.dispose(cleanup);
