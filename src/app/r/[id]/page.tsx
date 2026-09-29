// Request status (N5).
import { RequestStatusView } from "./request-status";

export const metadata = { title: "Request · Allotiq" };

export default async function Page({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  return <RequestStatusView id={id} />;
}
