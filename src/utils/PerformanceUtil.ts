// utils/PerformanceUtil.ts

// -----------------------------------------------------------------------------------------
export const debounce = <T extends (...args: any[]) => void>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
	let timeoutId: NodeJS.Timeout | null = null;
	return (...args: Parameters<T>) => {
		timeoutId && clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func(...args);
			timeoutId = null;
		}, delay);
	};
};

// -----------------------------------------------------------------------------------------
export const batchProcess = async <T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	batchSize: number = 10
): Promise<R[]> => {
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

// LRU 캐시 클래스 ----------------------------------------------------------------------
export class LRUCache<K, V> {
	private cache = new Map<K, V>();
	private readonly maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		value !== undefined && (this.cache.delete(key), this.cache.set(key, value));
		return value;
	}

	set(key: K, value: V): void {
		this.cache.has(key) && this.cache.delete(key);

		this.cache.size >= this.maxSize && (() => {
			const firstKey = this.cache.keys().next().value;
			firstKey !== undefined && this.cache.delete(firstKey);
		})();

		this.cache.set(key, value);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	delete(key: K): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}

// -----------------------------------------------------------------------------------------
export const isFileType = (type: number, target: number): boolean => (type & target) === target;

// -----------------------------------------------------------------------------------------
export const safeJsonParse = <T>(jsonString: string): T | null => {
	try {
		return JSON.parse(jsonString) as T;
	}
	catch {
		return null;
	}
};