/**
 * JSX context hooks for managing component-level state and shared values.
 *
 * Re-exports context utilities from Hono's JSX engine. Use `createContext`
 * to establish a provider and `useContext` to consume it in child components.
 * {@link useRequestContext} additionally provides access to the Hono request
 * context from within JSX.
 *
 * @example
 * ```tsx
 * const ThemeContext = createContext<"light" | "dark">("light");
 *
 * const ThemeProvider: FC = ({ children }) => (
 *   <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>
 * );
 *
 * const ThemedBox = () => {
 *   const theme = useContext(ThemeContext);
 *   return <div class={theme}>...</div>;
 * };
 * ```
 */
export { createContext, useContext } from "@hono/hono/jsx";
export { useRequestContext } from "@hono/hono/jsx-renderer";
