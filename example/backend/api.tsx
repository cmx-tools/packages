export type { Meta } from "@example/backend-contract";
import type * as Contract from "@example/backend-contract";
import { jsx } from "react/jsx-runtime";

export const UserProfile: typeof Contract.UserProfile = () => {
  return jsx("div", { children: "🧑‍🎤" });
};
