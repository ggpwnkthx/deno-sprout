// hydrator.ts - Island hydration helpers
export function hydrateIsland(name: string, _props: unknown): string {
  return `<script type="module" data-island="${name}">/* hydrate */</script>`;
}
