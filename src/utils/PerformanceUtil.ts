// utils/PerformanceUtil.ts

// -----------------------------------------------------------------------------------------
export const debounce = <T extends (...args: any[]) => void>(func: T, delay: number): ((...args: Parameters<T>) => void) => {
	let timeoutId: NodeJS.Timeout | null = null;
	return (...args: Parameters<T>) => {
		timeoutId && clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
};

// -----------------------------------------------------------------------------------------
export const batchProcess = async <T, R>(items: T[], processor: (item: T) => Promise<R>, batchSize: number = 10): Promise<R[]> => {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map(processor));
		results.push(...batchResults);
	}
	return results;
};

// LRU 캐시 클래스 ----------------------------------------------------------------------
export class LRUCache<K, V> {
	private cache = new Map<K, V>();

	constructor(private maxSize: number) {}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			// 재정렬 - 최근 사용된 것을 끝으로
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}
		else if (this.cache.size >= this.maxSize) {
			// 가장 오래된 항목 제거
			const firstKey = this.cache.keys().next().value;
			firstKey && this.cache.delete(firstKey);
		}

		this.cache.set(key, value);
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