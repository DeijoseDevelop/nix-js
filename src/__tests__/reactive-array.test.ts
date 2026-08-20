import { describe, expect, it } from "vitest";
import { signal, computed } from "/home/deiver/Documents/Projects/javascript/nix-js/nix-js-microframework/src/nix/reactivity.ts";
import { html } from "/home/deiver/Documents/Projects/javascript/nix-js/nix-js-microframework/src/nix/template/html.ts";

describe("reactive array rendering", () => {
  it("re-renders the full array when the source changes", () => {
    const genre = signal<string | null>("Sci-Fi");
    const movies = [
      { title: "Inception", genres: ["Sci-Fi"] },
      { title: "Mad Max", genres: ["Sci-Fi", "Action"] },
      { title: "Everything", genres: ["Sci-Fi", "Comedy"] },
      { title: "Parasite", genres: ["Thriller"] },
    ];
    const visible = computed(() => {
      const g = genre.value;
      return movies.filter((m) => !g || m.genres.includes(g));
    });
    const template = html`<div>${() => visible.value.map((m) => html`<p class="movie-card">${m.title}</p>`)}</div>`;
    const container = document.createElement("div");
    const handle = template.mount(container);
    expect(container.querySelectorAll(".movie-card")).toHaveLength(3);
    genre.value = null;
    expect(container.querySelectorAll(".movie-card")).toHaveLength(4);
    genre.value = "Sci-Fi";
    expect(container.querySelectorAll(".movie-card")).toHaveLength(3);
    handle.unmount();
  });
});
