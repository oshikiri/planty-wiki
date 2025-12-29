export interface Note {
  path: string;
  title: string;
  body: string;
  updatedAt?: string;
}

export interface SearchResult {
  path: string;
  title: string;
  snippet: string;
}
