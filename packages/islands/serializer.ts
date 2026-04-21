/**
 * @fileoverview Props serialization and deserialization for island hydration.
 *
 * Provides functions to serialize props to a base64-encoded JSON string
 * for embedding in HTML data attributes, and to deserialize them back
 * on the client.
 *
 * ## Serialization constraints
 *
 * Props must not contain:
 * - Functions or class instances
 * - Circular references
 * - `undefined` values inside objects
 *
 * ## Date handling
 *
 * Date objects are serialized as `{__type: "Date", value: timestamp}`
 * and reconstructed as `Date` objects on deserialization.
 *
 * ## Base64 note
 *
 * This module uses `@std/encoding/base64` (server-side). The client-side
 * decoder in `lib/runtime.ts` uses the browser's `atob` built-in. The
 * approaches are semantically identical but cannot be shared because one
 * runs on the server and the other is bundled for the browser.
 */

import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

/**
 * Serialize props to a Base64-encoded JSON string suitable for an HTML
 * data attribute. Throws if props contain non-serialisable values
 * (functions, class instances, circular refs, undefined object values).
 *
 * @param props - The props object to serialize
 * @returns A base64-encoded JSON string safe for use in an HTML data attribute
 * @throws {TypeError} If props contain a function
 * @throws {TypeError} If props contain a circular reference
 */
export function serializeProps(props: unknown): string {
  // Replacer to detect functions and class instances
  const visited = new Set<unknown>();
  const serialized = JSON.stringify(props, (_key, value) => {
    if (typeof value === "function") {
      throw new TypeError("Island props must not contain functions");
    }
    if (typeof value === "string" && ISO_DATE_REGEX.test(value)) {
      // Detect Date → ISO string (JSON.stringify converts Date before calling replacer).
      // Wrapping in {__type:"Date", value: "ISO"} causes infinite recursion because
      // the nested ISO string matches the same regex. Use a number (timestamp) for
      // the value instead - numbers don't match the ISO regex, so no recursion.
      return { __type: "Date", value: new Date(value).getTime() };
    }
    if (value !== null && typeof value === "object") {
      if (visited.has(value)) {
        throw new TypeError(
          "Island props must not contain circular references",
        );
      }
      visited.add(value);
    }
    return value;
  });
  // Base64-encode to produce HTML-safe attribute value with no unescaped quotes
  return encodeBase64(new TextEncoder().encode(serialized));
}

/**
 * Deserialize a Base64-encoded JSON string back to a typed object.
 *
 * @param serialized - Base64-encoded JSON string from the `data-props` attribute
 * @returns The deserialized props object with Date objects reconstructed
 * @throws {TypeError} If the input is not valid base64 or JSON
 */
export function deserializeProps<T = unknown>(serialized: string): T {
  try {
    const binary = decodeBase64(serialized);
    const json = new TextDecoder().decode(binary);
    return JSON.parse(json, (_key, value) => {
      if (
        value !== null &&
        typeof value === "object" &&
        (value as Record<string, unknown>).__type === "Date"
      ) {
        return new Date((value as { value: number }).value);
      }
      return value;
    }) as T;
  } catch (e) {
    throw new TypeError(
      `Failed to deserialize island props: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}
