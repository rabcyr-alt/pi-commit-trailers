/**
 * pi-session-trailer
 *
 * Appends a `Pi-Session: <session-id>` git trailer to every `git commit -m`
 * invocation the agent runs, recording which pi session produced the commit.
 *
 * Unlike a naive end-of-string append, this extension parses the bash command
 * and splices the trailer into each `git commit` invocation directly — so it
 * survives command chaining (`git commit -m msg && echo done`), pipes, redirects
 * (`> /dev/null 2>&1`), subshells, comments, and multiple commits in one command.
 *
 * Plays nicely alongside pi-co-authored-by (which adds Co-Authored-By and
 * Generated-By); the two extensions do not conflict.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { findGitCommitSpans, insertSessionTrailers } from "./lib/commit-span.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command;
		if (findGitCommitSpans(cmd).length === 0) return;

		const sid =
			ctx.sessionManager.getSessionId() ??
			process.env.PI_SESSION_ID ??
			"unknown";

		event.input.command = insertSessionTrailers(cmd, sid);
	});
}
