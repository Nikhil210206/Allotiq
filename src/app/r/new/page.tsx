// New request (N4). A cell clicked on the availability grid arrives as ?room=&date=&start=&end=.
import { RequestFlow } from "./request-flow";

export const metadata = { title: "New request · Allotiq" };

export default async function Page({ searchParams }: PageProps<"/r/new">) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <RequestFlow prefill={{ room: one(q.room), date: one(q.date), start: one(q.start), end: one(q.end) }} />;
}
