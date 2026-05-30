export type RagSource = {
  source: string;
  title: string;
};

export type RagChunk = RagSource & {
  id: string;
  text: string;
  ordinal: number;
};

export type RagSearchResult = RagChunk & {
  score: number;
};

export type RagConfig = {
  ollamaBaseUrl: string;
  ollamaModel: string;
  qdrantUrl: string;
  qdrantCollection: string;
  vectorSize: number;
  topK: number;
};

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}

export interface VectorStoreClient {
  ensureCollection(): Promise<void>;
  upsert(points: Array<RagChunk & { embedding: number[] }>): Promise<void>;
  search(vector: number[], limit: number): Promise<RagSearchResult[]>;
}
