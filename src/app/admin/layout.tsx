// Admin screens inside the AppShell. The live ticker joins once the audit feed exists (Aditi · D13).
// Owner: Nikhil · N2
import { AppShell } from "@/components/kit";
import { getShellUser } from "@/components/kit/shell-user";
import { groqEnabled } from "@/lib/ai/groq";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell user={await getShellUser("admin")} ai={groqEnabled()}>
      {children}
    </AppShell>
  );
}
