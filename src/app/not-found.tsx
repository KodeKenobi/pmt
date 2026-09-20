import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, LogIn } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#0F1419] text-white">
      <div className="absolute right-0 top-0 hidden h-64 w-64 border-b border-l border-white/10 lg:block" />
      <div className="absolute bottom-0 right-0 hidden h-32 w-32 border-l border-t border-white/10 lg:block" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-rows-[auto_1fr_auto] px-7 py-8 sm:px-12 sm:py-10">
        <header>
          <Image
            src="/lighthouse-logo.png"
            alt="Lighthouse Project Management"
            width={176}
            height={176}
            priority
            className="h-auto w-32"
          />
        </header>

        <section className="max-w-xl pt-6 sm:pt-10">
          <h1 className="text-3xl font-semibold leading-[1.08] sm:text-4xl">
            You have reached
            <span className="block text-white/45">the wrong address.</span>
          </h1>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/login"
              style={{ color: "#0F1419" }}
              className="inline-flex items-center gap-2 bg-white px-5 py-3 text-sm font-semibold text-[#0F1419] transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Go to sign in
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Return home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}