import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDictionary } from "@/lib/i18n/dictionary";
import { normalizeLocale } from "@/lib/i18n/locale";

export const metadata: Metadata = {
	title: "About",
	description:
		"Learn more about Chasing Chapters, a digital sanctuary for book lovers dedicated to the art of storytelling.",
};

export default async function AboutPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const appLocale = normalizeLocale(locale);
	const dictionary = getDictionary(appLocale);

	return (
		<div className="min-h-screen pb-20">
			{/* Hero Section */}
			<section className="relative py-20 md:py-32 bg-muted/30 overflow-hidden">
				<div className="container mx-auto px-4 md:px-6 relative z-10">
					<div className="max-w-3xl mx-auto text-center space-y-6">
						<h1 className="font-serif text-4xl md:text-6xl font-bold tracking-tight">
							{dictionary.aboutTitle}
						</h1>
						<p className="text-xl text-muted-foreground leading-relaxed">
							{dictionary.aboutIntro}
						</p>
					</div>
				</div>
			</section>

			{/* Content Section */}
			<section className="container mx-auto px-4 md:px-6 py-16 md:py-24">
				<div className="grid gap-12 lg:grid-cols-2 items-center">
					<div className="space-y-6 order-2 lg:order-1">
						<h2 className="font-serif text-3xl font-bold">
							{dictionary.aboutOurStory}
						</h2>
						<div className="prose prose-lg dark:prose-invert text-muted-foreground">
							<p>{dictionary.aboutStoryOne}</p>
							<p>{dictionary.aboutStoryTwo}</p>
							<p>{dictionary.aboutStoryThree}</p>
						</div>
						<div className="pt-4">
							<Button asChild size="lg">
								<Link href={`/${appLocale}/reviews`}>
									{dictionary.aboutExploreReviews}
								</Link>
							</Button>
						</div>
					</div>

					{/* Image Placeholder - In a real app, this would be a real image */}
					<div className="relative aspect-square md:aspect-4/5 lg:aspect-square bg-muted rounded-2xl overflow-hidden order-1 lg:order-2 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
						<Image
							src="/images/about-book.png"
							alt={dictionary.aboutImageAlt}
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
							{dictionary.aboutValuesTitle}
						</h2>
						<p className="text-muted-foreground">
							{dictionary.aboutValuesIntro}
						</p>
					</div>

					<div className="grid gap-8 sm:grid-cols-3">
						<div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
							<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
								1
							</div>
							<h3 className="font-serif text-xl font-bold">
								{dictionary.aboutValueHonesty}
							</h3>
							<p className="text-muted-foreground">
								{dictionary.aboutValueHonestyBody}
							</p>
						</div>
						<div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
							<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
								2
							</div>
							<h3 className="font-serif text-xl font-bold">
								{dictionary.aboutValueDiversity}
							</h3>
							<p className="text-muted-foreground">
								{dictionary.aboutValueDiversityBody}
							</p>
						</div>
						<div className="bg-background p-8 rounded-xl shadow-sm border text-center space-y-4">
							<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary font-serif font-bold text-xl">
								3
							</div>
							<h3 className="font-serif text-xl font-bold">
								{dictionary.aboutValueCommunity}
							</h3>
							<p className="text-muted-foreground">
								{dictionary.aboutValueCommunityBody}
							</p>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
