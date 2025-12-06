import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn more about Chasing Chapters, a digital sanctuary for book lovers dedicated to the art of storytelling.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen pb-20">
      {/* Hero Section */}
      <section className="relative py-20 md:py-32 bg-muted/30 overflow-hidden">
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight">
              About Chasing Chapters
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              A digital sanctuary for book lovers, dedicated to the art of
              storytelling and the joy of getting lost in a good book.
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div className="space-y-6 order-2 lg:order-1">
            <h2 className="font-serif text-3xl font-bold">Our Story</h2>
            <div className="prose prose-lg dark:prose-invert text-muted-foreground">
              <p>
                Chasing Chapters began as a simple reading journal—a place to
                document thoughts, feelings, and the lingering emotions left
                behind by a powerful story. Over time, it has evolved into a
                curated collection of reviews, reading lists, and literary
                explorations.
              </p>
              <p>
                We believe that every book has the right reader, and every
                reader has a soulmate book waiting to be discovered. Our mission
                is to bridge that gap, offering honest, thoughtful reviews that
                go beyond simple summaries.
              </p>
              <p>
                Whether you&apos;re looking for your next fantasy epic, a cozy
                mystery to curl up with, or literary fiction that challenges
                your perspective, you&apos;ll find a home here.
              </p>
            </div>
            <div className="pt-4">
              <Button asChild size="lg">
                <Link href="/reviews">Explore Reviews</Link>
              </Button>
            </div>
          </div>

          {/* Image Placeholder - In a real app, this would be a real image */}
          <div className="relative aspect-square md:aspect-4/5 lg:aspect-square bg-muted rounded-2xl overflow-hidden order-1 lg:order-2 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
            <Image
              src="/images/about-book.png"
              alt="A cozy reading corner with vintage books and tea"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="bg-primary/5 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="font-serif text-3xl font-bold mb-4">
              What We Value
            </h2>
            <p className="text-muted-foreground">
              The core principles that guide our reading and reviewing.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            <div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
                1
              </div>
              <h3 className="font-serif text-xl font-bold">Honesty</h3>
              <p className="text-muted-foreground">
                Authentic opinions, always. We celebrate what we love and
                constructively critique what we don&apos;t.
              </p>
            </div>
            <div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
                2
              </div>
              <h3 className="font-serif text-xl font-bold">Diversity</h3>
              <p className="text-muted-foreground">
                Reading widely across genres, cultures, and perspectives to
                broaden our understanding of the world.
              </p>
            </div>
            <div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
                3
              </div>
              <h3 className="font-serif text-xl font-bold">Community</h3>
              <p className="text-muted-foreground">
                Connecting with fellow bookworms and fostering a shared love for
                the written word.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
