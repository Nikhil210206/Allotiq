"use client";
// Last-resort crash screen when the root layout itself fails. It replaces the whole document, so it
// brings its own <html>, <body> and stylesheet (display fonts fall back to system faces). Owner: Nikhil · N9
import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { StatusScreen } from "@/components/kit";
import { Button } from "@/components/ui/button";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <title>Something broke · Allotiq</title>
        <StatusScreen
          code="500"
          eyebrow="Something broke"
          lead="Allotiq hit"
          accent="a snag."
          body="Bookings you've already sent are safe. Try again in a moment."
          detail={error.digest ? `Ref ${error.digest}` : undefined}
          actions={
            <Button variant="volt" size="lg" onClick={() => retry()}>
              <RotateCcw /> Try again
            </Button>
          }
        />
      </body>
    </html>
  );
}
