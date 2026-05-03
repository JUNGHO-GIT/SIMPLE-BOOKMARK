// assets/scripts/performance.ts

// 1-1. LRU 캐시
export class LRUCache<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly maxSize: number;

  // 1-1. constructor
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  // 1-2. get
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    value !== undefined && (this.cache.delete(key), this.cache.set(key, value));
    return value;
  }
  // 1-3. set
  set(key: K, value: V): void {
    this.cache.has(key) && this.cache.delete(key);
    this.cache.size >= this.maxSize && (() => {
        const firstKey = this.cache.keys().next().value;
        firstKey !== undefined && this.cache.delete(firstKey);
      })();
    this.cache.set(key, value);
  }
  // 1-4. has
  has(key: K): boolean {
    return this.cache.has(key);
  }
  // 1-5. delete
  delete(key: K): boolean {
    return this.cache.delete(key);
  }
  // 1-6. clear
  clear(): void {
    this.cache.clear();
  }
  // 1-7. size
  get size(): number {
    return this.cache.size;
  }
}
// 1-8. debounce
export const debounce = <Args extends unknown[]>(func: (...args: Args) => void, delay: number): ((...args: Args) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Args) => {
    timeoutId && clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
};

// 1-9. batchProcess
export const batchProcess = async <T, R>(items: T[], processor: (item: T) => Promise<R>, batchSize: number = 10): Promise<R[]> => {
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, items.length);
    const batch = items.slice(start, end);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
};

// 1-10. isFileType
export const isFileType = (type: number, target: number): boolean => (type & target) === target;

// 1-11. safeJsonParse
export const safeJsonParse = <T>(jsonString: string): T | null => {
  try {
    return JSON.parse(jsonString) as T;
  }
  catch {
    return null;
  }
};
