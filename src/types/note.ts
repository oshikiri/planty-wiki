export type Note = {
  path: string;
  title: string;
  body: string;
  updatedAt?: string;
};

export type SearchResult = {
  path: string;
  title: string;
  snippet: string;
};

export type PendingSave = {
  path: Note["path"];
  title: string;
  body: string;
};
