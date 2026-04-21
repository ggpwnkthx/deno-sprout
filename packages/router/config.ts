// config.ts - Route configuration types
/**
 * Per-route configuration options, optionally exported as `config` from a
 * route file module.
 *
 * @example
 * ```ts
 * // routes/blog/[slug].tsx
 * export const config: RouteConfig = {
 *   routeOverride: "/blog/post/:slug",
 *   skipInheritedLayouts: false,
 * };
 * export default renderBlogPost;
 * ```
 */
export interface RouteConfig {
  /**
   * Overrides the auto-derived URL pattern for this route file.
   * Use this to register a route under a different path than its filename.
   */
  routeOverride?: string;
  /**
   * When `true`, the root layout is excluded from the layout chain for this
   * route. The nearest layout (if any) is still applied.
   */
  skipInheritedLayouts?: boolean;
}

/**
 * Layout-level configuration, optionally exported as `config` from a
 * `_layout.tsx` file.
 */
export interface LayoutConfig {
  skipInheritedLayouts?: boolean;
}
