// Admin screens inside the AppShell. The live ticker joins once the audit feed exists (Aditi · D13).
// Owner: Nikhil · N2
import { AppShell } from "@/components/kit";
import { getShellUserFor } from "@/components/kit/shell-user";
import { groqEnabled } from "@/lib/ai/groq";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell user={await getShellUserFor("admin", ["admin"])} ai={groqEnabled()}>
      {children}
    </AppShell>
  );
}
