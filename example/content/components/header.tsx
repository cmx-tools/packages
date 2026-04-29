import { Header as UIHeader } from "@example/ui-library";
import { UserProfile } from "@example/backend-contract";

export default function Header({ children }: { children: React.ReactNode }) {
  return (
    <UIHeader>
      {children}
      <UserProfile />
    </UIHeader>
  );
}
