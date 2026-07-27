// Thin re-export so future `npx shadcn add <component>` files - which always
// import from "@/lib/utils" - work unmodified. The real implementation and
// its tests live at src/utils/cn/cn.ts, following this repo's own convention.
export { cn } from "../utils/cn/cn";
