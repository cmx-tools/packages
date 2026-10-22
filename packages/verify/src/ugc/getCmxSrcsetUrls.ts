const ASCII_WHITESPACE = /[\t\n\f\r ]/;

export function* getCmxSrcsetUrls(input: string): Generator<string> {
  let position = 0;
  while (position < input.length) {
    while (
      position < input.length &&
      (ASCII_WHITESPACE.test(input[position]) || input[position] === ",")
    ) {
      position++;
    }
    if (position === input.length) return;

    const start = position;
    while (position < input.length && !ASCII_WHITESPACE.test(input[position])) {
      position++;
    }
    const url = input.slice(start, position);
    if (url.endsWith(",")) {
      yield url.replace(/,+$/, "");
      continue;
    }

    yield url;
    let inParens = false;
    while (position < input.length) {
      const character = input[position++];
      if (inParens) {
        if (character === ")") inParens = false;
      } else if (character === "(") {
        inParens = true;
      } else if (character === ",") {
        break;
      }
    }
  }
}
