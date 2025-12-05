"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export function Navbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  useEffect(() => {
    setQuery(searchParams.get("q") || "");
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/reviews?q=${encodeURIComponent(query)}`);
    } else {
      router.push("/reviews");
    }
  };

  return (
    <nav className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-50 transition-all duration-300">
      <div className="container mx-auto px-6 md:px-12 lg:px-24 h-16 flex items-center justify-between max-w-7xl">
        <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
          Chasing Chapters
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/reviews"
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            Reviews
          </Link>
          <Link
            href="/reading-lists"
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            Reading Lists
          </Link>
          <Link
            href="/about"
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            About
          </Link>
          <Link
            href="/admin"
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            Write a Review
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search books..."
              className="w-[200px] pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <Button variant="ghost" size="icon" className="sm:hidden">
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
