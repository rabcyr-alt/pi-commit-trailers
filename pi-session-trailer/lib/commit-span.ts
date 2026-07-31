/**
 * Pure shell-command parsing logic for the pi-session-trailer extension.
 *
 * Goal: find every `git commit -m ...` invocation inside an arbitrary bash
 * command string (which may chain multiple commands with &&, ||, ;, |, &,
 * newlines, subshells, redirects, comments, etc.) and return the character
 * span of each one's argument list, so a trailer flag can be spliced into the
 * right place — not blindly appended at the end of the whole string.
 *
 * This module has no pi imports so it can be unit-tested in isolation.
 */

/** A parsed word with its character span. */
export interface Word {
	start: number;
	end: number;
	text: string;
}

/** A [start, end) span covering one `git commit` invocation's word list. */
export type CommitSpan = [number, number];

/** Unquoted characters that start a control operator or redirect. */
const OPERATORS = new Set(["&", "|", ";", "\n", "(", ")", "<", ">"]);

/** True if an unquoted character at `i` starts a control operator / redirect. */
function isOperatorAt(cmd: string, i: number): boolean {
	const c = cmd[i];
	if (OPERATORS.has(c)) return true;
	// fd-prefixed redirect, e.g. `2>` or `1<&`
	if (c >= "0" && c <= "9" && (cmd[i + 1] === "<" || cmd[i + 1] === ">")) return true;
	return false;
}

/** Skip a double-quoted segment starting at the opening `"`. */
function skipDoubleQuote(cmd: string, i: number, n: number): number {
	let j = i + 1;
	while (j < n) {
		const c = cmd[j];
		if (c === "\\") { j += 2; continue; }
		if (c === "$" && cmd[j + 1] === "(") { j = skipCommandSub(cmd, j + 2, n); continue; }
		if (c === "`") { j = skipBacktick(cmd, j, n); continue; }
		if (c === '"') return j + 1;
		j++;
	}
	return j;
}

/** Skip a single-quoted segment starting at the opening `'`. */
function skipSingleQuote(cmd: string, i: number, n: number): number {
	let j = i + 1;
	while (j < n && cmd[j] !== "'") j++;
	return Math.min(j + 1, n);
}

/** Skip a $'...' (ANSI-C quoted) segment starting at the `$`. */
function skipDollarSingleQuote(cmd: string, i: number, n: number): number {
	let j = i + 2; // skip the `$'`
	while (j < n) {
		const c = cmd[j];
		if (c === "\\") { j += 2; continue; }
		if (c === "'") return j + 1;
		j++;
	}
	return j;
}

/** Skip a $(...) command substitution, starting just after the `(`. Balances parens. */
function skipCommandSub(cmd: string, i: number, n: number): number {
	let depth = 1;
	let j = i;
	while (j < n && depth > 0) {
		const c = cmd[j];
		if (c === '"') { j = skipDoubleQuote(cmd, j, n); continue; }
		if (c === "'") { j = skipSingleQuote(cmd, j, n); continue; }
		if (c === "$" && cmd[j + 1] === "'") { j = skipDollarSingleQuote(cmd, j, n); continue; }
		if (c === "$" && cmd[j + 1] === "(") { j = skipCommandSub(cmd, j + 2, n); continue; }
		if (c === "`") { j = skipBacktick(cmd, j, n); continue; }
		if (c === "(") { depth++; j++; continue; }
		if (c === ")") { depth--; j++; continue; }
		j++;
	}
	return j;
}

/** Skip a backtick command substitution starting at the backtick. */
function skipBacktick(cmd: string, i: number, n: number): number {
	let j = i + 1;
	while (j < n) {
		const c = cmd[j];
		if (c === "\\") { j += 2; continue; }
		if (c === "`") return j + 1;
		j++;
	}
	return j;
}

/** Consume one shell word starting at `i` (its first char). Returns index past it. */
function consumeWord(cmd: string, i: number, n: number): number {
	let j = i;
	while (j < n) {
		const c = cmd[j];
		if (c === "\\" && cmd[j + 1] === "\n") { j += 2; continue; } // line continuation
		if (c === '"') { j = skipDoubleQuote(cmd, j, n); continue; }
		if (c === "'") { j = skipSingleQuote(cmd, j, n); continue; }
		if (c === "$" && cmd[j + 1] === "'") { j = skipDollarSingleQuote(cmd, j, n); continue; }
		if (c === "$" && cmd[j + 1] === "(") { j = skipCommandSub(cmd, j + 2, n); continue; }
		if (c === "`") { j = skipBacktick(cmd, j, n); continue; }
		if (c === " " || c === "\t" || c === "\r" || c === "\n") break;
		if (isOperatorAt(cmd, j)) break;
		j++;
	}
	return j;
}

/** Read one simple command's word list starting at `i`. `end` is where words stop. */
function readSimpleCommand(cmd: string, i: number, n: number): { words: Word[]; end: number } {
	const words: Word[] = [];
	while (i < n) {
		const c = cmd[i];
		if (c === " " || c === "\t" || c === "\r") { i++; continue; }
		if (c === "\\" && cmd[i + 1] === "\n") { i += 2; continue; }
		if (c === "#") { break; } // comment ends the word list; caller skips it
		if (isOperatorAt(cmd, i)) break;
		const start = i;
		const end = consumeWord(cmd, i, n);
		words.push({ start, end, text: cmd.slice(start, end) });
		i = end;
	}
	return { words, end: i };
}

/** Consume a control-operator / redirect run starting at `i`. */
function consumeOperator(cmd: string, i: number, n: number): number {
	let j = i;
	const c = cmd[j];
	if (c >= "0" && c <= "9" && (cmd[j + 1] === "<" || cmd[j + 1] === ">")) j++; // fd prefix
	const ops = "&|;<>()\n";
	while (j < n && ops.includes(cmd[j])) j++;
	return j;
}

/** Commands that transparently prefix another command (sudo git ..., env git ...). */
const RUNNERS = new Set([
	"sudo", "env", "nohup", "exec", "command", "nice", "time", "ionice", "strace", "valgrind",
]);

const ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Does `text` look like a `-m` / `--message` flag for `git commit`? */
function isMessageFlag(text: string): boolean {
	return (
		text === "-m" ||
		/^-[A-Za-z]*m/.test(text) ||
		text === "--message" ||
		/^--message=/.test(text)
	);
}

/**
 * Find every `git commit -m ...` invocation in `cmd` and return the span
 * [start, end) of each one's word list (excluding the trailing operator).
 *
 * Handles: single/double/$' quotes, $(...) and backtick command substitution,
 * line continuations, comments, redirects (including fd-prefixed like 2>&1),
 * and command chaining via &&, ||, ;, |, &, and newlines. Transparent command
 * runners (sudo, env, nohup, ...) are skipped when locating the `git` command.
 */
export function findGitCommitSpans(cmd: string): CommitSpan[] {
	const n = cmd.length;
	const spans: CommitSpan[] = [];
	let i = 0;
	while (i < n) {
		const c = cmd[i];
		if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
		if (c === "\\" && cmd[i + 1] === "\n") { i += 2; continue; }
		if (c === "#") { while (i < n && cmd[i] !== "\n") i++; continue; }
		if (isOperatorAt(cmd, i)) { i = consumeOperator(cmd, i, n); continue; }

		const cmdStart = i;
		const { words, end } = readSimpleCommand(cmd, i, n);

		// Resolve the effective command word, skipping env-var assignments and
		// transparent runners (sudo, env, ...).
		let idx = 0;
		while (idx < words.length && ASSIGN_RE.test(words[idx].text)) idx++;
		let cmdWord: string | null = idx < words.length ? words[idx].text : null;
		if (cmdWord && RUNNERS.has(cmdWord)) {
			idx++;
			while (idx < words.length && ASSIGN_RE.test(words[idx].text)) idx++;
			cmdWord = idx < words.length ? words[idx].text : null;
		}

		if (cmdWord === "git") {
			let hasCommit = false;
			let hasMessage = false;
			for (let k = idx + 1; k < words.length; k++) {
				const w = words[k].text;
				if (!hasCommit && w === "commit") { hasCommit = true; continue; }
				if (hasCommit && isMessageFlag(w)) hasMessage = true;
			}
			if (hasCommit && hasMessage) spans.push([cmdStart, end]);
		}

		i = end;
	}
	return spans;
}

/** Escape a string for safe inclusion inside a $'...' shell literal. */
function escapeDollarSingle(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Return the rewritten command with a `Pi-Session: <sessionId>` trailer spliced
 * into every `git commit` invocation. The trailer is inserted at the end of
 * each commit's own argument list (before any trailing operator), so chaining
 * like `git commit -m msg && echo done` keeps the trailer on the commit rather
 * than gluing it onto `echo`. Multiple commits in one command all get a trailer.
 */
export function insertSessionTrailers(cmd: string, sessionId: string): string {
	const spans = findGitCommitSpans(cmd);
	if (spans.length === 0) return cmd;
	// Leading + trailing space: leading separates from the preceding word
	// (needed when the commit is the whole command); trailing separates the
	// $'...' literal from a following operator such as `2>&1` or a `#` comment.
	const trailer = ` -m "" -m $'Pi-Session: ${escapeDollarSingle(sessionId)}' `;
	let out = cmd;
	for (let k = spans.length - 1; k >= 0; k--) {
		const end = spans[k][1];
		out = out.slice(0, end) + trailer + out.slice(end);
	}
	return out;
}
