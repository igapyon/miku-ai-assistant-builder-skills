# Source code workbook

## Overview

One Markdown text file is converted into a workbook with multiple worksheets.

| Item | Value |
|---|---|
| Format | UTF-8 Markdown |
| Split rule | Level-2 headings |

## Greeter module

```javascript
export function greet(name) {
  return `Hello, ${name}!`;
}
```

## Entry point

```javascript
import { greet } from "./greeter.mjs";

process.stdout.write(`${greet("Miku")}\n`);
```
