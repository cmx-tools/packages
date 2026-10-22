import { UserProfile, type Meta } from "@example/backend-contract";
import Header from "../components/header.js";
import portrait from "../portrait.svg";
import { AssetImage } from "@example/ui-library";

export const meta: Meta = {
  title: "About",
  accessory: <UserProfile />,
};

export default async function About() {
  return (
    <div>
      <Header>About</Header>
      <p>About</p>
      <AssetImage
        src={portrait.preview}
        width={portrait.width}
        height={portrait.height}
        alt="Portrait"
      />
    </div>
  );
}
