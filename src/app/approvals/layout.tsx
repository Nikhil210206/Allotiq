// Approver screens inside the AppShell (phone-first). Owner: Nikhil
import { AppShell } from "@/components/kit";
import { getShellUserFor } from "@/components/kit/shell-user";
import { groqEnabled } from "@/lib/ai/groq";

export default async function ApprovalsLayout({ children }: LayoutProps<"/approvals">) {
  return (
    <AppShell user={await getShellUserFor("approver", ["approver", "admin"])} ai={groqEnabled()}>
      {children}
    </AppShell>
  );
}
