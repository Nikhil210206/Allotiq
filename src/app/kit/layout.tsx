// Living style guide for the design kit (Nikhil · N2), shown inside the real AppShell.
import { AppShell } from "@/components/kit";
import { getShellUser } from "@/components/kit/shell-user";

export default async function KitLayout({ children }: LayoutProps<"/kit">) {
  const user = await getShellUser("admin");
  return (
    <AppShell user={user} ai tone="ink" bleed>
      {children}
    </AppShell>
  );
}
