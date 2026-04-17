// config.ts - Route configuration types
export interface RouteConfig {
  routeOverride?: string;
  skipInheritedLayouts?: boolean;
}

export interface LayoutConfig {
  skipInheritedLayouts?: boolean;
}
