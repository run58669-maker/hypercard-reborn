# HyperTalk Subset Grammar

This document is the single source of truth for the language that HyperCard Reborn
cards speak. The parser in `src/parser/` implements exactly this grammar, the
compile prompt embeds this file verbatim, and the six example scripts at the
bottom are the bundled examples that the offline canned compiler serves
(`.kiro/specs/flip-card/examples/`, imported by `src/examples/`). A Kiro hook keeps
the examples here and there byte-identical.

Design goals, in priority order:

1. **Small.** Everything fits on one page. A card author can read the whole language.
2. **Deterministic.** No ambiguity in the grammar; one script parses one way.
3. **Recognisably HyperTalk.** Familiar keywords and phrasing, not a new language.

Anything not in this document is a parse error. The parser never guesses.

## 1. Lexical structure

```ebnf
script          = { blank_line | comment_line | handler } ;

comment_line    = "--" { any_char - newline } newline ;
blank_line      = { whitespace } newline ;

identifier      = letter { letter | digit | "_" } ;              (* case-insensitive *)
number          = digit { digit } [ "." digit { digit } ] ;
string          = '"' { any_char - '"' - newline } '"' ;         (* no escapes *)
newline         = "\n" | "\r\n" ;
whitespace      = " " | "\t" ;
```

- Keywords and identifiers are **case-insensitive** (`MouseUp`, `mouseup` and `mouseUp` are the same).
- String literals contain **no escape sequences**. To include a double quote, use `quote` (see §5).
- A `--` comment runs to end of line and may also follow a statement on the same line.
- Statements end at a newline. There is no statement separator and no line continuation.
- **End of input counts as a newline** wherever the grammar requires one, so a script
  without a trailing newline parses the same as one with it. The bundled examples end
  with exactly one newline.
- Operators lex by longest match: `&&` is one token, never two `&`; `<=`, `>=` and `<>`
  are single tokens.
- Any character that is not whitespace, a newline, part of a token above or inside a
  string is a parse error (`unexpected character "~"`).
- The `down` keyword is reserved only in the phrase `down to`.
- Reserved words (cannot be used as variable names): `on end if then else repeat with to down times while forever put into set get go card field button show hide answer the and or not is div mod true false quote empty return`.

## 2. Handlers

```ebnf
handler         = "on" handler_name newline
                    statements
                  "end" handler_name newline ;

handler_name    = "mouseUp" | "openCard" ;
statements      = { blank_line | comment_line | statement newline } ;
```

- Blank lines and comment-only lines may appear anywhere statements may, inside a
  handler as well as between handlers.

- A script contains at most one handler of each name. A second `on mouseUp` is a parse error.
- `end` must name the same handler as the matching `on` (`end mouseUp` closes `on mouseUp`).
- `openCard` is sent when the card runs (first show, and every re-run after a script edit).
- `mouseUp` is sent when the user clicks any button on the card. The clicked button's
  name is available as `the target` (§5).

## 3. Statements

```ebnf
statement       = put_stmt | set_stmt | get_stmt | if_stmt | repeat_stmt
                | answer_stmt | go_stmt | show_stmt | hide_stmt ;

put_stmt        = "put" expression [ "into" container ] ;
                  (* without "into": puts into the message box, shown as a toast *)
set_stmt        = "set" property "of" object_ref "to" expression ;
get_stmt        = "get" expression ;                               (* stores into the variable "it" *)

if_stmt         = "if" expression "then" newline
                    statements
                  [ "else" newline
                    statements ]
                  "end" "if"
                | "if" expression "then" statement
                  [ newline "else" statement ] ;                   (* single-line form *)
                  (* the statement after "then" or "else" in the single-line form
                     must not itself be an if_stmt or a repeat_stmt *)

repeat_stmt     = "repeat" repeat_head newline
                    statements
                  "end" "repeat" ;
repeat_head     = expression "times"
                | "with" identifier "=" expression ( "to" | "down" "to" ) expression
                | "while" expression
                | "forever" ;                                      (* see iteration cap, §7 *)

answer_stmt     = "answer" expression ;
go_stmt         = "go" [ "to" ] "card" expression ;               (* expression evaluates to a card number, 1-based *)
show_stmt       = "show" object_ref ;
hide_stmt       = "hide" object_ref ;

container       = identifier                                      (* a local variable *)
                | object_ref ;                                    (* the text of a field; buttons are not containers *)
object_ref      = "field" string | "button" string ;
property        = "visible" | "enabled" | "name" ;
```

Notes:

- Variables are handler-local and untyped. Reading an unset variable yields its own
  name as a string, exactly as in HyperCard (`put x` with no `x` puts `"x"`). Variable
  names are case-insensitive (`Total` and `total` are the same variable); the string an
  unset variable yields is the name as spelled at the reading site.
- The two `if` forms are told apart by what follows `then`: a newline means the block
  form (which must end with `end if`), anything else means the single-line form. A
  single-line `if` may be followed on the very next line by `else` and one statement;
  that `else` belongs to the single-line `if`, never to an enclosing block `if`.
- A reserved word (§1) where a variable name is expected is a parse error
  (`expected a variable name, found "end"`).
- `put ... into field "name"` sets the field's text. `put ... into button "name"` is a
  parse error (buttons are not containers; use `set name of button ...`).
- `set visible of field "x" to false` is equivalent to `hide field "x"`.
- `go to card N` sends `openCard` to card N after the current handler finishes. If N
  is out of range it is a runtime error and the current card stays.
- Nesting depth of `if` and `repeat` is unlimited by the grammar; the interpreter caps
  total statement executions (§7).

## 4. Expressions

Precedence from lowest to highest. All binary operators are left-associative.

```ebnf
expression      = or_expr ;
or_expr         = and_expr { "or" and_expr } ;
and_expr        = not_expr { "and" not_expr } ;
not_expr        = "not" not_expr | comparison ;
comparison      = concat_expr [ comp_op concat_expr ] ;
comp_op         = "=" | "<>" | "<" | ">" | "<=" | ">=" | "is" | "is" "not" ;
concat_expr     = additive { ( "&" | "&&" ) additive } ;          (* && inserts a space *)
additive        = term { ( "+" | "-" ) term } ;
term            = unary { ( "*" | "/" | "div" | "mod" ) unary } ;
unary           = "-" unary | primary ;
primary         = number | string | "true" | "false" | "empty" | "quote" | "return"
                | identifier
                | object_ref                                      (* the text of a field / the name of a button *)
                | "the" builtin_function
                | "(" expression ")" ;
builtin_function= "date" | "time" | "target" ;
```

Semantics:

- **Values are strings.** Every value is a string; `+ - * / div mod` convert both
  operands to numbers, and it is a runtime error if either is not numeric.
  `/` on zero is a runtime error. Results are rendered with up to 6 decimals, with
  trailing zeros removed (`10 / 4` is `2.5`, `4 / 2` is `2`).
- **Numeric** means: after removing leading and trailing spaces and tabs, the string
  matches `-?[0-9]+(\.[0-9]+)?`. Nothing else is numeric (`1.`, `.5`, `1e3`, `+1` and
  the empty string are not). Conversion is exact decimal to IEEE double. A result that
  is not finite is a runtime error.
- `div` truncates toward zero (`-7 div 2` is `-3`); `mod` takes the sign of the left
  operand (`-7 mod 2` is `-1`, `7 mod -2` is `1`). `div` and `mod` by zero are runtime errors,
  like `/`.
- `&` concatenates; `&&` concatenates with a single space between.
- `=` and `is` compare numerically when both sides are numeric, otherwise as
  case-insensitive strings. `<>` and `is not` are their negations. `< > <= >=`
  follow the same numeric-or-string rule; string order is the order of the lower-cased
  UTF-16 code units. Comparisons yield the strings `true` or `false`.
- After `is`, a following `not` always belongs to the operator: `a is not b` is a
  negated comparison, never `a is (not b)`. Write `a is (not b)` if that is meant.
- `and`, `or`, `not` require the strings `true` or `false` (case-insensitive); anything
  else is a runtime error. Both operands of `and` and `or` are always evaluated, left to
  right; there is no short-circuit. The result is the lower-case string `true` or `false`.
- `empty` is the empty string. `quote` is the double-quote character. `return` is a
  single newline character (`\n`); it is the only way to put a line break in a value.
- `repeat with i = a to b` counts up by 1 and runs zero times if `a > b`;
  `repeat with i = a down to b` counts down by 1 and runs zero times if `a < b`.
  `a` and `b` are evaluated once, before the first iteration, and must be numeric. The
  loop keeps its own counter and assigns it to `i` at the start of each iteration, so
  writing to `i` inside the body does not change how many times the loop runs. After the
  loop, `i` holds the value of the last iteration (or is untouched if there was none).
- `repeat N times` evaluates `N` once; it must be numeric; it is truncated toward zero
  and anything below 1 runs the body zero times. `repeat while e` evaluates `e` before
  every iteration and `e` must be `true` or `false`.
- `the date` is the host's date in the form `11/1/26` (month/day/two-digit year,
  no padding). `the time` is `3:04 PM` (12-hour clock, hour unpadded from 1 to 12,
  minute padded, `12:00 AM` at midnight). `the target` is the name of the button that
  received `mouseUp` (empty inside `openCard`). `it` is an ordinary variable that `get` writes.
- Reading `field "x"` where no such field exists is a runtime error. `button "x"` as an
  expression yields the button's current name if it exists and is a runtime error otherwise.
- Object names in `field "x"` / `button "x"` are matched case-insensitively against the
  objects' **current** names (a button renamed with `set name of` is found under its new name).
- `set visible of ... to e` and `set enabled of ... to e` require `e` to be `true` or
  `false`. `enabled` exists on buttons only; on a field it is a runtime error. A disabled
  button does not send `mouseUp`. `set name of ... to e` renames the object to the
  value of `e`.

## 5. Built-ins summary

| Form | Effect |
|---|---|
| `answer <expr>` | Shows a modal dialog with the value and an OK button. |
| `go to card <expr>` / `go card <expr>` | Switches to card number N (1-based) after the handler ends. |
| `show field "x"` / `show button "x"` | Makes the object visible. |
| `hide field "x"` / `hide button "x"` | Hides the object. |
| `the date`, `the time` | Host date and time, formatted as above. |
| `the target` | Name of the clicked button during `mouseUp`. |
| `put <expr>` | Shows the value in the message box (a non-modal toast). |
| `get <expr>` | Stores the value into `it`. |

## 6. Parse errors

The parser returns the **first** error it meets, never a list, with:

- `line` and `column` (1-based, in the source as committed, counting `\r\n` as one newline),
- `message`, phrased as *expected X, found Y* (`expected "then", found newline`),
- `near`: the source line text, so the UI can show it without re-reading the script.

Error messages must be stable: tests assert on them, and the flipped card shows them verbatim.

## 7. Runtime limits

These keep the card UI responsive and are **not** part of the grammar.

| Limit | Value |
|---|---|
| Statements executed per handler invocation | 10,000 (exceeding it is a runtime error: `script ran too long`) |
| `repeat forever` | Allowed, but subject to the statement cap |
| String length | 64 KiB (65,536 UTF-16 code units) per value; exceeding it is the runtime error `value too long` |

The complete list of runtime error messages lives in `.kiro/specs/flip-card/design.md` §5.4.

## 8. Example scripts

These six examples are bundled with the app. Each natural-language description below
is what a card author would type; each script is what the compiler must produce for it.
The offline canned compiler maps the description to the script by normalised exact
match (see `design.md` §6.3). Every example must parse.

The machine-readable copy lives in `.kiro/specs/flip-card/examples/<id>.hc/`
(`description.txt` is the text after **Description:**, with no trailing newline;
`script.hc` is the body of the ```` ```hypertalk ```` fence, ending with exactly one
newline). `src/examples/index.ts` imports those files with `?raw`, so the app ships
these bytes. The consistency test and hook verify this section and that directory are
byte-identical (extraction rule: `design.md` §6.7).

### Example 1: `hello`

**Description:** When the card opens, put "Hello, world!" into the field named "greeting".

```hypertalk
on openCard
  put "Hello, world!" into field "greeting"
end openCard
```

### Example 2: `counter`

**Description:** The card has a field "count" and a button "Increment". When the card opens, set the count to 0. When the button is clicked, add one to the count.

```hypertalk
on openCard
  put 0 into field "count"
end openCard

on mouseUp
  if the target is "Increment" then
    put field "count" + 1 into field "count"
  end if
end mouseUp
```

### Example 3: `date-stamp`

**Description:** When the "Stamp" button is clicked, put today's date into the field "stamp" and show the field. When the card opens, hide the field "stamp".

```hypertalk
on openCard
  hide field "stamp"
end openCard

on mouseUp
  if the target is "Stamp" then
    put the date into field "stamp"
    show field "stamp"
  end if
end mouseUp
```

### Example 4: `greeter`

**Description:** There is a field "name" and a button "Greet". When Greet is clicked, if the name field is empty, answer "Please enter your name."; otherwise answer "Hello, " followed by the name and an exclamation mark.

```hypertalk
on mouseUp
  if the target is "Greet" then
    if field "name" is empty then
      answer "Please enter your name."
    else
      answer "Hello, " & field "name" & "!"
    end if
  end if
end mouseUp
```

### Example 5: `countdown`

**Description:** The card has a field "list" and a button "Go". When Go is clicked, fill the list field with the numbers from 10 down to 1, each on its own line, followed by the word "Liftoff!".

```hypertalk
on mouseUp
  if the target is "Go" then
    put empty into field "list"
    repeat with i = 10 down to 1
      put field "list" & i & return into field "list"
    end repeat
    put field "list" & "Liftoff!" into field "list"
  end if
end mouseUp
```

### Example 6: `quiz`

**Description:** The card shows the question "What is 2 + 2?" in field "question" when it opens, with a field "answer" for the user to type into and a button "Check". When Check is clicked, if the answer is 4, answer "Correct!" and go to card 2; otherwise answer "Try again."

```hypertalk
on openCard
  put "What is 2 + 2?" into field "question"
  put empty into field "answer"
end openCard

on mouseUp
  if the target is "Check" then
    if field "answer" = 4 then
      answer "Correct!"
      go to card 2
    else
      answer "Try again."
    end if
  end if
end mouseUp
```

## 9. Things deliberately left out

Each of these is a plausible next step and none is in scope for the flip-card hackathon:

- Custom handlers and `send`; message passing between objects.
- `the mouseLoc`, `the clickLoc` and any other mouse state.
- Chunk expressions (`line 2 of field "x"`, `word 3 of ...`).
- `global` variables and anything that outlives a handler invocation (field contents are the only persistent state).
- Numeric formatting via `numberFormat`.
- `wait`, timers, `idle`.
- Escape sequences in string literals.
