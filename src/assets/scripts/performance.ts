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
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
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
// 1-8. isFileType
export const isFileType = (type: number, target: number): boolean => (type & target) === target;
