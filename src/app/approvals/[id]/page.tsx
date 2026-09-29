// Review one request (mobile-first).
import { ApprovalReview } from "./approval-review";

export const metadata = { title: "Review · Allotiq" };

export default async function Page({ params }: PageProps<"/approvals/[id]">) {
  const { id } = await params;
  return <ApprovalReview id={id} />;
}
