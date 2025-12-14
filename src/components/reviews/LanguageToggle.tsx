"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function LanguageToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentLocale = searchParams.get("locale") || "en";

  const setLocale = (locale: "en" | "id") => {
    const params = new URLSearchParams(searchParams);
    params.set("locale", locale);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="inline-flex items-center rounded-md border bg-background text-sm">
      <button
        onClick={() => setLocale("en")}
        className={`px-3 py-1.5 rounded-l-md transition-colors ${
          currentLocale === "en"
            ? "bg-primary text-primary-foreground font-medium"
            : "hover:bg-muted"
        }`}
      >
        EN
      </button>
      <div className="w-px h-6 bg-border" />
      <button
        onClick={() => setLocale("id")}
        className={`px-3 py-1.5 rounded-r-md transition-colors ${
          currentLocale === "id"
            ? "bg-primary text-primary-foreground font-medium"
            : "hover:bg-muted"
        }`}
      >
        ID
      </button>
    </div>
  );
}
