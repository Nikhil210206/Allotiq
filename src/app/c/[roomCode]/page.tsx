// QR check-in (mobile-first): /c/{code}?k={qr_secret}.
import { CheckIn } from "./checkin";

export const metadata = { title: "Check in · Allotiq" };

export default async function Page({ params, searchParams }: PageProps<"/c/[roomCode]">) {
  const { roomCode } = await params;
  const { k } = await searchParams;
  return <CheckIn code={decodeURIComponent(roomCode)} k={typeof k === "string" ? k : ""} />;
}
