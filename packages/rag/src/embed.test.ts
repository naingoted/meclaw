import { describe, expect, it, vi } from "vitest";

import { OllamaEmbedder } from "./embed";

describe("OllamaEmbedder", () => {
  it("posts to the ollama embeddings endpoint and returns the numeric vector", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const embedder = new OllamaEmbedder({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      fetchFn,
    });

    await expect(embedder.embed("hello world")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "http://localhost:11434/api/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          prompt: "hello world",
        }),
      }),
    );
  });

  it("throws a useful error on non-ok responses", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("bad request", { status: 400, statusText: "Bad Request" });
    });

    const embedder = new OllamaEmbedder({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      fetchFn,
    });

    await expect(embedder.embed("hello")).rejects.toThrow(
      "Ollama embeddings request failed with status 400 Bad Request",
    );
  });

  it("throws when the response embedding is malformed", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(JSON.stringify({ embedding: ["oops"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const embedder = new OllamaEmbedder({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      fetchFn,
    });

    await expect(embedder.embed("hello")).rejects.toThrow(
      "Ollama embeddings response missing numeric embedding array",
    );
  });
});
