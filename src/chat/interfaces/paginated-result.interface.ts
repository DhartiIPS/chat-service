export interface PaginatedResult<T> {
  items: T[];
  /** Pass as `cursor` in the next request to fetch the following page. Null when no more pages exist. */
  nextCursor: string | null;
}
