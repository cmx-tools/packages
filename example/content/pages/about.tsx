import type { Meta } from "@example/backend-contract";
import Header from "../components/header.js";

export const meta: Meta = { title: "About" };

export default async function About() {
  return (
    <div>
      <Header>About</Header>
      <p>About</p>
    </div>
  );
}
