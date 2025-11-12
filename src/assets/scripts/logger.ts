// assets/scripts/logger.ts

// -----------------------------------------------------------------------------------------
export const logger = (
	type:
	`debug` |
	`info` |
	`warn` |
	`error`,
	key:
	`activate` |
	`deactivate` |
	`add` |
	`copy` |
	`paste` |
	`remove` |
	`rename` |
	`move` |
	`duplicate` |
	`create` |
	`save` |
	`overwrite` |
	`export` |
	`select` |
	`expand` |
	`collapse`,
	value: string,
): void => {
	type === `debug` && console.debug(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `info` && console.info(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `warn` && console.warn(
		`[Simple-Bookmark] [${key}] ${value}`
	);
	type === `error` && console.error(
		`[Simple-Bookmark] [${key}] ${value}`
	);
};