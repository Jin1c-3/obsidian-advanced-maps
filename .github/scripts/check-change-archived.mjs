/*
 * Catches a finished OpenSpec change that never got archived. Three pull
 * requests have merged carrying one, and each was repaired a different way
 * afterwards, because the ordering rule lived only in whoever remembered it.
 *
 * The trigger is completed tasks rather than the mere existence of an active
 * change: this check runs inside `npm run check`, which is itself the last task
 * of every change, so failing on any active change would make the repository's
 * own verification command unusable during the work it verifies.
 *
 * Usage: node .github/scripts/check-change-archived.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const CHANGES_DIR = 'openspec/changes';
const ARCHIVE_DIR = 'archive';

// Only the marker matters here. A change whose task list has no checkboxes at
// all is left alone rather than guessed at, so a schema that stops using them
// makes this check quiet instead of wrong.
const CHECKBOX = /^[ \t]*-[ \t]*\[([ xX])\]/gm;

if (!existsSync(CHANGES_DIR)) {
	console.log(`No ${CHANGES_DIR} directory; no OpenSpec change can be waiting to be archived.`);
	process.exit(0);
}

const active = readdirSync(CHANGES_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && entry.name !== ARCHIVE_DIR)
	.map((entry) => entry.name);

const finished = [];
let inProgress = 0;

for (const name of active) {
	const tasksPath = join(CHANGES_DIR, name, 'tasks.md');
	if (!existsSync(tasksPath)) {
		inProgress += 1;
		continue;
	}
	const boxes = [...readFileSync(tasksPath, 'utf8').matchAll(CHECKBOX)].map((match) => match[1]);
	if (boxes.length === 0) {
		inProgress += 1;
		continue;
	}
	if (boxes.some((box) => box === ' ')) {
		inProgress += 1;
		continue;
	}
	finished.push({ name, total: boxes.length });
}

if (finished.length > 0) {
	console.error('A finished OpenSpec change is still active:');
	for (const { name, total } of finished) {
		console.error(`  · ${name} — all ${total} tasks are complete but it is not archived`);
	}
	console.error('');
	console.error('Promote its deltas into openspec/specs/, then move it under');
	console.error(`${CHANGES_DIR}/${ARCHIVE_DIR}/, before opening the pull request. One pull request`);
	console.error('carries the implementation, the promoted specs, and the archived change.');
	process.exit(1);
}

const summary =
	inProgress === 0
		? 'No active OpenSpec change; nothing is waiting to be archived.'
		: `${inProgress} active OpenSpec change${inProgress === 1 ? '' : 's'} still in progress; none is due for archive.`;
console.log(summary);
