# Bundled example cards

One directory per card, named `<id>.hc`, holding exactly two files:

| File | Content | Trailing newline |
|---|---|---|
| `description.txt` | The natural-language description, as a card author would type it. | none |
| `script.hc` | The HyperTalk-subset script the compiler must produce for it. | exactly one `\n`, the one the grammar requires after the final `end` |

Both files are byte-for-byte the text under `## 8. Example scripts` in `docs/grammar.md`:
`description.txt` is the text after `**Description:** ` on that example's line, and
`script.hc` is the body of its ```` ```hypertalk ```` fence. The extraction rule is
written out in `design.md` §6.7 and is what `src/examples/consistency.test.ts` implements.

`src/examples/index.ts` imports these files with Vite's `?raw` suffix, so the app ships
this directory's bytes and there is no third copy to drift. The ids, in stack order:

1. `hello`
2. `counter`
3. `date-stamp`
4. `greeter`
5. `countdown`
6. `quiz`

Do not edit these files by hand in isolation: change `docs/grammar.md` and let the
grammar-examples-consistency hook copy the change here, or the other way round.
