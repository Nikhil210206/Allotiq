import { Placeholder } from "@/components/kit/placeholder";

// Home: will redirect to the signed-in user's role home (requester → /r/new, approver → /approvals,
// admin → /admin/dashboard) once auth lands (Aditi · D2).
export default function Home() {
  return (
    <Placeholder
      title="Allotiq"
      owner="Team"
      task="Phase 0"
      description="Every request. The right room. Even when plans change."
    />
  );
}
