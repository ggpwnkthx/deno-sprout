import type { JSX } from "@sprout/jsx";

export default function Post(props: { params: { slug: string } }): JSX.Element {
  return <main>{props.params.slug}</main>;
}
