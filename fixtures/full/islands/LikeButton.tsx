import { signal } from "@ggpwnkthx/sprout-islands";

export default function LikeButton() {
  const count = signal(0);

  return (
    <button type="button" onClick={() => count.value++}>
      ❤️ {count.value}
    </button>
  );
}
