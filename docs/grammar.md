# HyperTalk Subset Grammar

This document is the single source of truth for the language that HyperCard Reborn
cards speak. The parser in `src/parser/` implements exactly this grammar, the
compile prompt embeds this file verbatim, and the six example scripts at the
bottom are the bundled examples that the offline canned compiler serves
(`src/examples/`). A Kiro hook keeps the examples here and in `src/examples/`
byte-identical.

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
- The `down` keyword is reserved only in the phrase `down to`.
- Reserved words (cannot be used as variable names): `on end if then else repeat with to down times while forever put into set get go card field button show hide answer the and or not is div mod true false quote empty return`.

## 2. Handlers

```ebnf
handler         = "on" handler_name newline
                    statements
                  "end" handler_name newline ;

handler_name    = "mouseUp" | "openCard" ;
statements      = { statement newline } ;
```

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
  name as a string, exactly as in HyperCard (`put x` with no `x` puts `"x"`).
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
primary         = number | string | "true" | "false" | "empty" | "quote"
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
- `&` concatenates; `&&` concatenates with a single space between.
- `=` and `is` compare numerically when both sides are numeric, otherwise as
  case-insensitive strings. `<>` and `is not` are their negations. `< > <= >=`
  follow the same numeric-or-string rule.
- `and`, `or`, `not` require the strings `true` or `false`; anything else is a runtime error.
- `empty` is the empty string. `quote` is the double-quote character. `return` is a
  single newline character (`\n`); it is the only way to put a line break in a value.
- `repeat with i = a to b` counts up by 1 and runs zero times if `a > b`;
  `repeat with i = a down to b` counts down by 1 and runs zero times if `a < b`.
- `the date` is the host's date in the form `11/1/26` (month/day/two-digit year,
  no padding). `the time` is `3:04 PM`. `the target` is the name of the button that
  received `mouseUp` (empty inside `openCard`). `it` is an ordinary variable that `get` writes.
- Reading `field "x"` where no such field exists is a runtime error.

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
| String length | 64 KiB per value |

## 8. Example scripts

These six examples are bundled with the app (`src/examples/`). Each natural-language
description below is what a card author would type; each script is what the compiler
must produce for it. The offline canned compiler maps the description to the script
by normalised exact match (see `design.md` §6.3). Every example must parse, and the
consistency hook verifies the scripts here and in `src/examples/` are byte-identical.

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
