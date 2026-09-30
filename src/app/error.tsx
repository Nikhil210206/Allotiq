"use client";
// Crash screen for anything outside a signed-in shell (the shells have their own: ShellError).
// `retry` re-fetches and re-renders the segment. Owner: Nikhil · N9
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/kit";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusScreen
      code="500"
      eyebrow="Something broke"
      lead="That didn't"
      accent="go to plan."
      body="Bookings you've already sent are safe. Try again, and if it keeps happening, head home and start from there."
      detail={error.digest ? `Ref ${error.digest}` : undefined}
      actions={
        <>
          <Button variant="volt" size="lg" onClick={() => retry()}>
            <RotateCcw /> Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
            Go home
          </Link>
        </>
      }
    />
  );
}
