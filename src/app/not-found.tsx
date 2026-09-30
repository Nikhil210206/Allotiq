// 404 for unknown URLs and notFound() calls. Owner: Nikhil · N9
import Link from "next/link";
import type { Metadata } from "next";
import { RollLabel, StatusScreen } from "@/components/kit";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found · Allotiq" };

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      eyebrow="Page not found"
      lead="No room"
      accent="at this address."
      body="The link may be old, or the booking it pointed to has moved on. Everything live is one click away."
      actions={
        <>
          <Link href="/" className={buttonVariants({ variant: "volt", size: "lg" })}>
            <RollLabel>Go home</RollLabel>
          </Link>
          <Link href="/availability" className={buttonVariants({ variant: "outline", size: "lg" })}>
            See what&apos;s free
          </Link>
        </>
      }
    />
  );
}
