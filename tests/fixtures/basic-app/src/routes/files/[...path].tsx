import type { JSX } from "@sprout/jsx";

export default function Files(props: { params: { path: string } }): JSX.Element {
  return <main>{props.params.path}</main>;
}
