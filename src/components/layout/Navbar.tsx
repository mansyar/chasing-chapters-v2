import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function Navbar() {
  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
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
        </div>

        <div className="flex items-center gap-4">
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search books..."
              className="w-[200px] pl-9"
            />
          </div>
          <Button variant="ghost" size="icon" className="sm:hidden">
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
