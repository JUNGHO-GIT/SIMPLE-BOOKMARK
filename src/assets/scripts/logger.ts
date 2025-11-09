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
		`[simple-bookmark] [${key}] ${value}`
	);
	type === `info` && console.info(
		`[simple-bookmark] [${key}] ${value}`
	);
	type === `warn` && console.warn(
		`[simple-bookmark] [${key}] ${value}`
	);
	type === `error` && console.error(
		`[simple-bookmark] [${key}] ${value}`
	);
};