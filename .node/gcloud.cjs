// gcloud.cjs

const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

// OS 확인 --------------------------------------------------------------------------------------
const fnDetectOsAndArgs = () => {
	try {
		const winOrLinux = os.platform() === 'win32' ? `win` : `linux`;
		const args = process.argv.slice(2);

		console.log(`Activated OS: ${winOrLinux}`);
		console.log(`args: ${args}`);

		return {
			os: winOrLinux,
			args: args
		};
	}
	catch (error) {
		console.error(error);
		process.exit(1);
	}
};

// changelog 수정 ----------------------------------------------------------------------------------
const fnModifyChangelog = () => {
	try {
		const currentDate = new Date().toLocaleDateString('ko-KR', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});

		const currentTime = new Date().toLocaleTimeString('ko-KR', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});

		const changelog = fs.readFileSync(`changelog.md`, 'utf8');
		const versionPattern = /(\s*)(\d+[.]\d+[.]\d+)(\s*)/g;
		const matches = [...changelog.matchAll(versionPattern)];
		const lastMatch = matches[matches.length - 1];
		const lastVersion = lastMatch[2];
		const versionArray = lastVersion.split('.');
		versionArray[2] = (parseInt(versionArray[2]) + 1).toString();

		let newVersion = `\\[ ${versionArray.join('.')} \\]`;
		let newDateTime = `- ${currentDate} (${currentTime})`;
		newDateTime = newDateTime.replace(/([.]\s*[(])/g, ` (`);
		newDateTime = newDateTime.replace(/([.]\s*)/g, `-`);
		newDateTime = newDateTime.replace(/[(](\W*)(\s*)/g, `(`);

		const newEntry = `\n## ${newVersion}\n\n${newDateTime}\n`;
		const updatedChangelog = changelog + newEntry;

		fs.writeFileSync(`changelog.md`, updatedChangelog, 'utf8');
		console.log(`Changelog updated: ${versionArray.join('.')}`);
	}
	catch (error) {
		console.error(error);
		process.exit(1);
	}
};

// git push 공통 함수 -------------------------------------------------------------------------------
const fnGitPush = (remoteName, ignoreFilePath) => {
	try {
		const ignoreFile = `.gitignore`;
		const ignorePublicFile = fs.readFileSync(`.gitignore.public`, 'utf8');
		const ignoreContent = fs.readFileSync(ignoreFilePath, 'utf8');
		const currentBranch = execSync(`git branch --show-current`, { encoding: 'utf8' }).trim();

		fs.writeFileSync(ignoreFile, ignoreContent, 'utf8');
		execSync(`git rm -r -f --cached .`, { stdio: 'inherit' });
		execSync(`git add .`, { stdio: 'inherit' });

		const statusOutput = execSync(`git status --porcelain`, { encoding: 'utf8' }).trim();
		if (statusOutput) {
			const commitMessage = (winOrLinux === `win`) ? (
				`git commit -m "%date% %time:~0,8%"`
			) : (
				`git commit -m "$(date +%Y-%m-%d) $(date +%H:%M:%S)"`
			);
			execSync(commitMessage, { stdio: 'inherit' });
		}
		else {
			console.log(`No changes to commit. Skipping commit step.`);
		}
		execSync(`git push --force ${remoteName} ${currentBranch}`, { stdio: 'inherit' });
		fs.writeFileSync(ignoreFile, ignorePublicFile, 'utf8');
	}
	catch (error) {
		console.error(error);
		process.exit(1);
	}
};

// -------------------------------------------------------------------------------------------------
const { os: winOrLinux, args } = fnDetectOsAndArgs();
if (args.includes(`--full-deploy`)) {
	fnModifyChangelog();
	fnGitPush(`origin`, `.gitignore.public`);
	fnGitPush(`private`, `.gitignore.private`);
}
else if (args.includes(`--only-git`)) {
	fnModifyChangelog();
	fnGitPush(`origin`, `.gitignore.public`);
	fnGitPush(`private`, `.gitignore.private`);
}
else {
	throw new Error(`Invalid argument. Use --only-git or --full-deploy.`);
}
process.exit(0);