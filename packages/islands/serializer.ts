// serializer.ts - Props serialization for islands
export function serializeProps(props: unknown): string {
  return JSON.stringify(props);
}

export function deserializeProps<T>(serialized: string): T {
  return JSON.parse(serialized);
}
