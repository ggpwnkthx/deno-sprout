// The LikeButton island. A simple client-side counter that takes
// the current like count and the post slug as props. The server
// page passes the current count from the data layer; the client
// island increments on click. The `slug` prop is included to show
// JSON-serializable string props (the post identifier).
import type { JSX } from "@sprout/jsx";

export type LikeButtonProps = {
  readonly initial: number;
  readonly slug: string;
};

export default function LikeButton(props: LikeButtonProps): JSX.Element {
  return (
    <button type="button" data-slug={props.slug}>
      Likes: {props.initial}
    </button>
  );
}
