import { signal } from "@ggpwnkthx/sprout";

export default function Counter() {
  const count = signal(0);
  return (
    <div>
      <p>Count: {count.value}</p>
      <button
        type="button"
        onClick={() => count.value++}
      >
        Increment
      </button>
    </div>
  );
}
