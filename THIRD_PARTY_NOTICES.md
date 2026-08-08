# Third-Party Notices

## pi-co-authored-by

This project's `index.ts` is derived in part from
[`pi-co-authored-by`](https://github.com/bruno-garcia/pi-co-authored-by) by
Bruno Garcia, licensed under the MIT License.

Specifically, the following are adapted from `pi-co-authored-by`'s
`extensions/co-authored-by.ts`:

- The `tool_call` event hook structure (guard with `isToolCallEventType("bash")`,
  read `ctx.model`, mutate `event.input.command`).
- The model-name resolution line:
  `model.name || \`${model.provider}/${model.id}\``, falling back to `"unknown"`.
- The `Co-Authored-By` and `Generated-By` trailer content and the use of the
  `-m "" -m $'...'` mechanism to produce git-interpret-trailers paragraphs.

The shell command-parsing and trailer-splicing logic in `lib/commit-span.ts`
(finding each `git commit` invocation within a chained command and splicing a
trailer block into it) is original to this project and contains no code from
`pi-co-authored-by`.

The original `pi-co-authored-by` license is reproduced below.

---

```
MIT License

Copyright (c) 2026 Bruno Garcia

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
