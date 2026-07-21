import * as React from "react";

export type HighlightedTextProps = {
  text: string;
  query?: string;
};

/** Renders case-insensitive query matches without changing the source text. */
export function HighlightedText(props: HighlightedTextProps): React.ReactElement {
  const ranges = findHighlightRanges(props.text, props.query ?? "");
  if (ranges.length === 0) {
    return <>{props.text}</>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(props.text.slice(cursor, range.start));
    }
    parts.push(
      <mark className="ui-search-highlight" key={`${range.start}-${index}`}>
        {props.text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < props.text.length) {
    parts.push(props.text.slice(cursor));
  }

  return <>{parts}</>;
}

export function findHighlightRanges(
  text: string,
  query: string
): Array<{ start: number; end: number }> {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const haystack = text.toLocaleLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];
  let offset = 0;
  while (offset < haystack.length) {
    const start = haystack.indexOf(needle, offset);
    if (start === -1) {
      break;
    }
    ranges.push({ start, end: start + needle.length });
    offset = start + needle.length;
  }
  return ranges;
}
