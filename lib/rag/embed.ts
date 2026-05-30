import type { EmbeddingClient } from "./types";

type FetchFn = typeof fetch;

type OllamaEmbedderOptions = {
  baseUrl?: string;
  model?: string;
  fetchFn?: FetchFn;
};

type EmbeddingResponse = {
  embedding?: unknown;
};

export class OllamaEmbedder implements EmbeddingClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchFn: FetchFn;

  constructor(options: OllamaEmbedderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
    this.model = options.model ?? "nomic-embed-text";
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.fetchFn(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embeddings request failed with status ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as EmbeddingResponse;

    if (
      !Array.isArray(data.embedding) ||
      data.embedding.some((value) => typeof value !== "number" || Number.isNaN(value))
    ) {
      throw new Error("Ollama embeddings response missing numeric embedding array");
    }

    return data.embedding;
  }
}
