import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center text-center p-6">
        <h1 className="font-serif text-6xl md:text-8xl font-medium mb-4">
          404
        </h1>
        <h2 className="font-serif text-2xl md:text-3xl mb-6">
          Chapter Missing
        </h2>
        <p className="text-muted-foreground text-lg max-w-md mb-8">
          It seems you've turned to a page that doesn't exist yet. The story
          continues elsewhere.
        </p>
        <div className="flex gap-4">
          <Button asChild>
            <Link href="/">Return Home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/reading-lists">Browse Reading Lists</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
