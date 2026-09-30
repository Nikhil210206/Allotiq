// Requester screens inside the AppShell. Owner: Nikhil · N2
import { AppShell } from "@/components/kit";
import { getShellUserFor } from "@/components/kit/shell-user";
import { groqEnabled } from "@/lib/ai/groq";

export default async function RequesterLayout({ children }: LayoutProps<"/r">) {
  return (
    <AppShell user={await getShellUserFor("requester", ["requester", "admin"])} ai={groqEnabled()}>
      {children}
    </AppShell>
  );
}
