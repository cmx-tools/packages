import type { Properties } from "csstype";

export type CmxStyle = Properties<string | number> & {
  [property: `--${string}`]: string | number | undefined;
};
