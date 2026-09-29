// Check-in pages: a bare phone frame — people arrive here from a QR sticker, often not signed in.
import { Toaster, Wordmark } from "@/components/kit";

export default function CheckinLayout({ children }: LayoutProps<"/c">) {
  return (
    <div data-tone="light" className="light flex min-h-dvh flex-col bg-bone text-ink">
      <header className="mx-auto flex w-full max-w-xl items-center px-6 pt-6">
        <Wordmark />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pt-10 pb-16">{children}</main>
      <Toaster />
    </div>
  );
}
