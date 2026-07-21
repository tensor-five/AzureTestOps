import * as React from "react";

export type ChevronDirection = "down" | "right" | "up";

export type ChevronIconProps = {
  direction: ChevronDirection;
  className?: string;
};

export function ChevronIcon(props: ChevronIconProps): React.ReactElement {
  const className = ["u-chevron-icon", props.className].filter(Boolean).join(" ");

  return (
    <svg
      className={className}
      data-direction={props.direction}
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden="true"
    >
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
    </svg>
  );
}
