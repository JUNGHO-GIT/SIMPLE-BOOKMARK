# AI INSTRUCTIONS

## CODING PHILOSOPHY

- Performance first: Minimize memory waste/leaks, maximize efficiency
- Readability: Clear variable names (avoid abbreviations like result => r)
- Consistency: Uniform code formatting across projects
- Maintainability: Avoid deeply nested logic, prefer flat structure
- Professional: Strict adherence to team coding conventions

## PREFERRED CODE STYLE

- JavaScript: ES6+ syntax, arrow functions with 'fn' prefix
- JavaScript: Use Template literals for strings like `foo` and never use double quotes ("") for "OBJECT KEYS"
- Formatting: Always use braces with line breaks for control structures
- Spacing: Exactly ONE SPACE around assignment operators ('=' or ':')
- Structure: Clear separation of concerns, organized files

## WORK CONTEXT

- Korean development environment (may use Korean terms/comments)
- Enterprise codebase maintenance and modernization
- Strict team coding standards and review processes
- Legacy system modernization within Java 1.8 constraints
- Payment reconciliation and transaction processing focus
- Real-time API integration with multiple payment gateways

## RESPONSE PRINCIPLES

- When evidence lacking: "I don't know" or "I have insufficient evidence"
- Never guess or fabricate information
- Verify step-by-step, mark unclear parts as "unsure"
- If speculation needed: state "이것은 추측입니다" in Korean
- Provide detailed, objective, professional responses
- Capture core intent, not just literal interpretation
- Acknowledge and correct previous errors immediately

## CODE MODIFICATION RULES

- ALWAYS modify code when sent, return ENTIRE code
- Brief change description at end
- Never modify comments (even `// -----------` or `// foo -----------`)
- Never break line before semicolon

## IF-ELSE / TRY-CATCH FORMATTING

- MUST use braces {..} with "Line Breaks" and "Indent"

- INCORRECT:

  ```java | javascript | etc
  if (x) return y;
  if (x) doSomething();
  if (condition) { statement; }
  ```

- CORRECT:

  ```java | javascript | etc
  if (x) {
    return y;
  }
  if (condition) {
    statement;
  }
  else {
    statement;
  }
  try {
    riskyOperation();
  }
  catch (Exception e) {
    handleError(e);
  }
  ```

## TERNARY OPERATOR CHAINS

- Wrap each condition/result in parentheses on separate lines

- INCORRECT:

  ```java | javascript | etc
  (!str || str === "today")
    ? moment()
    : (str === "yesterday")
      ? moment(str, "YYYYMMDD")
      : moment(str)
  ```

- CORRECT:

  ```java | javascript | etc
  (!str || str === `today`) ? (
    moment()
  ) : (str === "yesterday") ? (
    moment(str, "YYYYMMDD")
  ) : (
    moment(str)
  )
  ```
