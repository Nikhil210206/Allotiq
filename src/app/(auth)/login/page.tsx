// Sign in with demo role cards (?as=<persona> signs straight in).
import { Suspense } from "react";
import { Toaster } from "@/components/kit";
import { Login } from "./login";

export const metadata = { title: "Sign in · Allotiq" };

export default function Page() {
  return (
    <>
      <Suspense>
        <Login />
      </Suspense>
      <Toaster />
    </>
  );
}
