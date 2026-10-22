import { UserProfile, type Meta } from "@example/backend-contract";
import Header from "../components/header.js";
import portrait from "../portrait.svg";

export const meta: Meta = {
  title: "About",
  accessory: <UserProfile />,
};

export default async function About() {
  return (
    <div>
      <Header>About</Header>
      <p>About</p>
      <img
        src={portrait.preview}
        srcSet={portrait.srcset}
        width={portrait.width}
        height={portrait.height}
        alt="Portrait"
      />
    </div>
  );
}
