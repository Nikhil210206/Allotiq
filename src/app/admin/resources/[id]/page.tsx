// One room: edit, maintenance windows, check-in QR.
import { RoomDetail } from "./room-detail";

export const metadata = { title: "Room · Allotiq" };

export default async function Page({ params }: PageProps<"/admin/resources/[id]">) {
  const { id } = await params;
  return <RoomDetail id={id} />;
}
