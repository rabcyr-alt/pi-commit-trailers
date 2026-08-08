/**
 * pi-commit-trailers
 *
 * Automatically appends git trailers to every `git commit -m` invocation the
 * agent runs, recording which model, which pi version, and which pi session
 * produced the commit:
 *
 *   Co-Authored-By: <model> <noreply@pi.dev>
 *   Generated-By: pi <version>
 *   Pi-Session: <session-id>
 *
 * Unlike a naive end-of-string append, this extension parses the bash command
 * and splices the trailer block into each `git commit` invocation directly — so
 * it survives command chaining (`git commit -m msg && echo done`), pipes,
 * redirects (`> /dev/null 2>&1`), subshells, comments, and multiple commits in
 * one command. This is a merge of pi-co-authored-by's trailer set with the
 * session-id trailer, using robust span-based splicing for all of them.
 *
 * Trailers are formatted per git-interpret-trailers conventions.
 *
 * Attribution: The tool_call hook structure, model-name resolution, and the
 * Co-Authored-By / Generated-By trailer content are derived from
 * pi-co-authored-by (https://github.com/bruno-garcia/pi-co-authored-by)
 * by Bruno Garcia, MIT licensed. The shell-parsing logic in
 * lib/commit-span.ts is original to this project. See LICENSE and
 * THIRD_PARTY_NOTICES.md.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType, VERSION } from "@earendil-works/pi-coding-agent";
import { findGitCommitSpans, insertTrailers } from "./lib/commit-span.ts";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command;
		if (findGitCommitSpans(cmd).length === 0) return;

		const model = ctx.model;
		const modelName = model
			? (model.name || `${model.provider}/${model.id}`)
			: "unknown";

		const sessionId =
			ctx.sessionManager.getSessionId() ??
			process.env.PI_SESSION_ID ??
			"unknown";

		const trailers = [
			`Co-Authored-By: ${modelName} <noreply@pi.dev>`,
			`Generated-By: pi ${VERSION}`,
			`Pi-Session: ${sessionId}`,
		];

		event.input.command = insertTrailers(cmd, trailers);
	});
}
