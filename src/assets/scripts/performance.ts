// assets/scripts/performanceUtil.ts

// LRU 캐시 클래스 ----------------------------------------------------------------------
// 최근에 사용한 항목을 우선 보존하는 간단한 메모리 캐시입니다.
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
// 호출을 지연시켜 짧은 시간 내 연속 호출을 하나로 합칩니다.
export const fnDebounce = <T extends (...args: any[]) => void>(
	func: T, delay: number
): ((...args: Parameters<T>) => void) => {
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
// 대량 작업을 지정한 배치 크기로 나눠 병렬 처리
export const fnBatchProcess = async <T, R>(
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

// -----------------------------------------------------------------------------------------
// VS Code FileType 비트마스크에서 특정 타입 포함 여부를 판단
export const fnIsFileType = (
	type: number,
	target: number
): boolean => {
	return (type & target) === target;
}

// -----------------------------------------------------------------------------------------
// JSON 파싱 실패 시 null을 반환하는 안전한 파서입니다.
export const fnSafeJsonParse = <T>(
	jsonString: string
): T | null => {
	try {
		return JSON.parse(jsonString) as T;
	}
	catch {
		return null;
	}
};