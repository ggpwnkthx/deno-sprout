/**
 * @ggpwnkthx/sprout-init
 * Project scaffolding for Sprout applications.
 *
 * Provides the `initProject` function to scaffold new projects from
 * built-in templates, and the `renderTemplate` utility for template
 * substitution (deprecated).
 *
 * @example
 * ```ts
 * import { initProject } from "@ggpwnkthx/sprout-init";
 *
 * await initProject({ name: "my-app", template: "blog" });
 * ```
 *
 * @module
 */
export { initProject } from "./init.ts";
export { renderTemplate } from "./template.ts";
export {
  DirectoryNotEmptyError,
  InitError,
  type InitErrorCode,
  type InitOptions,
  InvalidFilePathError,
  MissingNameError,
  type ProjectFile,
  type Template,
  type TemplateName,
  UnknownTemplateError,
} from "./template.ts";
