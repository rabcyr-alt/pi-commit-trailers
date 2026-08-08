import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { findGitCommitSpans, insertTrailers } from "../lib/commit-span.ts";

const TRAILERS = [
	"Co-Authored-By: Test Model <noreply@pi.dev>",
	"Generated-By: pi 9.9.9",
	"Pi-Session: abc-123",
];

const ins = (cmd: string) => insertTrailers(cmd, TRAILERS);
// The trailer block ends with `...Pi-Session: abc-123'` (closing quote of the
// shared $'...' block), immediately followed by the trailing operator.
const blockEnd = `Pi-Session: abc-123'`;
const countSession = (s: string) => (s.match(/Pi-Session: abc-123/g) || []).length;
const hasAllThree = (s: string) =>
	s.includes("Co-Authored-By: Test Model <noreply@pi.dev>") &&
	s.includes("Generated-By: pi 9.9.9") &&
	s.includes("Pi-Session: abc-123");

/** True if `rewritten` passes `bash -n` (shell syntax check). */
function bashOk(rewritten: string): boolean {
	try {
		execSync("bash -n", { input: rewritten, stdio: ["pipe", "pipe", "pipe"] });
		return true;
	} catch {
		return false;
	}
}

describe("findGitCommitSpans", () => {
	// [command, expected number of `git commit -m` invocations]
	const cases: Array<[string, number]> = [
		[`git commit -m "msg"`, 1],
		[`git commit -m "msg" && echo done`, 1],
		[`echo before && git commit -m "msg"`, 1],
		[`echo b && git commit -m "msg" && echo a`, 1],
		[`git -C /tmp commit -m msg`, 1],
		[`sudo git commit -m msg`, 1],
		[`env VAR=x git commit -m msg`, 1],
		[`echo "git commit -m msg"`, 0], // git inside quotes is not a command
		[`echo git commit -m msg`, 0], // git is an argument to echo
		[`git commit -m msg > /dev/null 2>&1`, 1],
		[`git commit -m msg # cmt`, 1],
		[`git commit -m "msg && x"`, 1], // && inside quotes does not split
		[`git commit -m msg; git commit -m msg2`, 2],
		[`git commit --message=foo`, 1],
		[`git commit --message foo`, 1],
		[`git commit -am "msg"`, 1],
		[`git log -m msg`, 0], // not a commit
		[`git commit`, 0], // no -m
		[`(git commit -m msg)`, 1],
		[`git commit -m "$(date)"`, 1],
		[`git commit -m msg | tee log`, 1],
		[`cd /tmp && git commit -m msg`, 1],
		[`git commit -m msg &`, 1],
		[`git commit -m msg || true`, 1],
		[`git commit -m 'it'"'"'s here'`, 1], // escaped single quote in message
	];

	for (const [cmd, n] of cases) {
		it(`finds ${n} commit(s): ${cmd}`, () => {
			expect(findGitCommitSpans(cmd)).toHaveLength(n);
		});
	}
});

describe("insertTrailers — content", () => {
	const matching: Array<[string, number]> = [
		[`git commit -m "msg"`, 1],
		[`git commit -m "msg" && echo done`, 1],
		[`echo before && git commit -m "msg"`, 1],
		[`echo b && git commit -m "msg" && echo a`, 1],
		[`git -C /tmp commit -m msg`, 1],
		[`sudo git commit -m msg`, 1],
		[`env VAR=x git commit -m msg`, 1],
		[`git commit -m msg > /dev/null 2>&1`, 1],
		[`git commit -m msg # cmt`, 1],
		[`git commit -m "msg && x"`, 1],
		[`git commit -m msg; git commit -m msg2`, 2],
		[`git commit --message=foo`, 1],
		[`git commit --message foo`, 1],
		[`git commit -am "msg"`, 1],
		[`(git commit -m msg)`, 1],
		[`git commit -m "$(date)"`, 1],
		[`git commit -m msg | tee log`, 1],
		[`cd /tmp && git commit -m msg`, 1],
		[`git commit -m msg &`, 1],
		[`git commit -m msg || true`, 1],
		[`git commit -m 'it'"'"'s here'`, 1],
	];

	for (const [cmd, n] of matching) {
		it(`adds all 3 trailers to: ${cmd}`, () => {
			expect(hasAllThree(ins(cmd))).toBe(true);
		});
		it(`adds exactly ${n} trailer block(s) to: ${cmd}`, () => {
			expect(countSession(ins(cmd))).toBe(n);
		});
		it(`produces valid bash for: ${cmd}`, () => {
			expect(bashOk(ins(cmd))).toBe(true);
		});
	}
});

describe("insertTrailers — placement (trailer lands on the commit, not a trailing command)", () => {
	it("places trailer before &&", () => {
		expect(ins(`git commit -m "msg" && echo done`)).toContain(`${blockEnd} && echo`);
	});
	it("does not glue trailers onto a trailing echo", () => {
		expect(ins(`git commit -m "msg" && echo done`)).not.toContain(`echo done -m`);
	});
	it("places trailer before a redirect target", () => {
		expect(ins(`git commit -m msg > /dev/null 2>&1`)).toContain(`${blockEnd} > /dev/null`);
	});
	it("keeps an fd-redirect like 2>&1 intact", () => {
		expect(ins(`git commit -m msg 2>&1`)).toContain(`${blockEnd} 2>&1`);
	});
	it("places trailer before a # comment", () => {
		expect(ins(`git commit -m msg # cmt`)).toContain(`${blockEnd} # cmt`);
	});
	it("places trailer before ; separating two commits", () => {
		expect(ins(`git commit -m msg; git commit -m msg2`)).toContain(`${blockEnd} ; git commit`);
	});
	it("places trailer before |", () => {
		expect(ins(`git commit -m msg | tee log`)).toContain(`${blockEnd} | tee`);
	});
	it("places trailer before trailing &", () => {
		expect(ins(`git commit -m msg &`)).toContain(`${blockEnd} &`);
	});
});

describe("insertTrailers — edge cases", () => {
	it("does not split on && inside a quoted message", () => {
		expect(countSession(ins(`git commit -m "msg && x"`))).toBe(1);
	});
	it("preserves quoted message content", () => {
		expect(ins(`git commit -m "msg && x"`)).toContain(`"msg && x"`);
	});
	it("leaves a non-commit command unchanged", () => {
		expect(ins(`echo git commit -m msg`)).toBe(`echo git commit -m msg`);
	});
	it("does not touch git-inside-quotes", () => {
		expect(countSession(ins(`echo "git commit -m msg"`))).toBe(0);
	});
	it("handles a subshell commit", () => {
		expect(countSession(ins(`(git commit -m msg)`))).toBe(1);
	});
	it("handles a command substitution in the message", () => {
		expect(countSession(ins(`git commit -m "$(date)"`))).toBe(1);
	});
	it("puts all trailers in a single -m block (one paragraph)", () => {
		expect((ins(`git commit -m msg`).match(/-m \$'/g) || []).length).toBe(1);
	});
	it("tags a sudo commit", () => {
		expect(countSession(ins(`sudo git commit -m msg`))).toBe(1);
	});
	it("escapes single quotes in trailer values", () => {
		const out = insertTrailers(`git commit -m msg`, ["Pi-Session: it's here"]);
		expect(bashOk(out)).toBe(true);
		expect(out).toContain(`it\\'s here`);
	});
	it("is a no-op when no trailers are given", () => {
		expect(insertTrailers(`git commit -m msg`, [])).toBe(`git commit -m msg`);
	});
	it("is a no-op when there is no commit to tag", () => {
		expect(insertTrailers(`git log -m msg`, TRAILERS)).toBe(`git log -m msg`);
	});
});
