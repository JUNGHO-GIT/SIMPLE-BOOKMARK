// utils.ts

// --------------------------------------------------------------------------------------------------------------
export const detectFileType = (label: string) => {
	if (label.startsWith('.')) {
		if (!label.includes('.', 1)) {
			return true;
		}
		const basename = label.split('/').pop();
		if (!basename) {
			return true;
		}
		if (basename.indexOf('.') === 0 && basename.lastIndexOf('.') === 0) {
			return false;
		}
	}
	const ext = label.split('.').pop()
	if (ext === label) {
		return true;
	}
	return false;
}

// --------------------------------------------------------------------------------------------------------------
export const safeStringify = (obj: any): string => {
	const seen = new WeakSet();
	const result = JSON.stringify(obj, function (key, value) {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) {
				return;
			}
			seen.add(value);
		}
		return value;
	});
	return result;
}