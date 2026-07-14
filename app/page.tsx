"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { UrlInput } from "@/components/url-input";
import { Card } from "@/components/ui/card";
import { AuthModal } from "@/components/auth-modal";
import { extractSupportedVideoId } from "@/lib/utils";
import { toast } from "sonner";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    if (!searchParams) return;

    const authError = searchParams.get("auth_error");
    const authStatus = searchParams.get("auth_status");

    if (authStatus === "link_expired") {
      toast.info("Your verification link has expired or was already used. Please try signing in.", {
        duration: 5000,
      });
      setAuthModalOpen(true);
    } else if (authError) {
      toast.error(`Authentication failed: ${decodeURIComponent(authError)}`);
    } else {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("auth_error");
    params.delete("auth_status");
    const queryString = params.toString();
    router.replace(queryString ? `/?${queryString}` : "/", { scroll: false });
  }, [router, searchParams]);

  const handleSubmit = useCallback(
    (url: string) => {
      const video = extractSupportedVideoId(url);
      if (!video) {
        toast.error("Please enter a valid YouTube or bilibili URL");
        return;
      }

      const params = new URLSearchParams();
      params.set("url", url);
      router.push(`/analyze/${video.videoId}?${params.toString()}`);
    },
    [router]
  );

  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="mx-auto flex w-full max-w-[660px] -translate-y-[5vh] transform flex-col items-center gap-9 px-6 py-16 text-center sm:py-24">
          <header className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[21px] font-bold tracking-tight text-[#787878]">LongCut</h1>
            </div>
            <p className="text-[14px] leading-[15px] text-[#787878]">
              Learn from long YouTube and bilibili videos without watching every minute.
            </p>
          </header>

          <div className="flex w-full flex-col items-center gap-9">
            <UrlInput onSubmit={handleSubmit} />

            <Card className="relative flex w-[425px] max-w-full flex-col gap-2.5 overflow-hidden rounded-[22px] border border-[#f0f1f1] bg-white p-6 text-left shadow-[2px_11px_40.4px_rgba(0,0,0,0.06)]">
              <div className="relative z-10 flex flex-col gap-2.5">
                <h3 className="text-[14px] font-medium leading-[15px] text-[#5c5c5c]">
                  Concepts first. Timestamps included.
                </h3>
                <p className="max-w-full text-[14px] leading-[1.5] text-[#8d8d8d] sm:max-w-[72%]">
                  Paste a captioned video, generate a Concept Map with your own AI key, then jump to the evidence.
                </p>
              </div>
              <div className="pointer-events-none absolute right-[10px] top-0 hidden h-[110px] w-[110px] sm:block">
                <div className="absolute inset-0 overflow-hidden rounded-full opacity-100 [mask-image:radial-gradient(circle,black_30%,transparent_65%)]">
                  <Image
                    src="/gradient_person.jpg"
                    alt="Gradient silhouette illustration"
                    fill
                    sizes="100px"
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </>
  );
}
