/**
 * The public interface dictionary.
 *
 * Every user-facing string the public site renders comes from here (`FR-4`).
 * The key space is intentionally flat: `en` is the source of truth, its keys
 * become `DictionaryKey`, and `id` is typed as a `Record` over them, so a
 * missing or misspelled Indonesian key is a type error rather than a blank on
 * the page. The runtime key-set test (`dictionary.test.ts`) guards the compiled
 * output on top of that.
 *
 * This module is server-side only by convention: client components never import
 * it, they receive the strings they need as props. That keeps the dictionary out
 * of the client bundle (`NFR-2`) and is asserted by a source scan in
 * `dictionary-source.test.ts`.
 */

import { type Locale, normalizeLocale } from "./locale";

/**
 * Every interface string, in English.
 *
 * `as const` is what makes the keys literal types, which is what makes the
 * Indonesian dictionary's completeness a compile-time check.
 */
const en = {
	// Document shell
	skipToContent: "Skip to content",

	// Navigation
	navReviews: "Reviews",
	navReadingLists: "Reading Lists",
	navAbout: "About",
	navWriteReview: "Write a Review",
	navSearchPlaceholder: "Search books...",
	navToggleSearch: "Toggle search",
	navToggleMenu: "Toggle menu",
	navMenuTitle: "Navigation",

	// Language control
	languageGroup: "Language",
	languageEnglish: "English",
	languageIndonesian: "Bahasa Indonesia",

	// Theme control
	themeToggle: "Toggle theme",
	themeLight: "Light",
	themeDark: "Dark",
	themeSystem: "System",

	// Footer
	footerTagline: "A personal space for book lovers.",
	footerRssLabel: "RSS feed of latest reviews",
	footerRights: "All rights reserved.",

	// Home
	homeCuratedReadingLists: "Curated Reading Lists",
	homeLatestReviews: "Latest Reviews",
	homeViewAll: "View All",
	homeNoReviewsTitle: "No reviews yet",
	homeNoReviewsDescription:
		"The first reviews are being written — check back soon.",
	heroFeaturedReview: "Featured Review",
	heroReadFullReview: "Read Full Review",
	heroCarouselLabel: "Featured reviews carousel",
	heroPreviousReview: "Previous review",
	heroNextReview: "Next review",
	heroGoToSlide: "Go to slide {slide}",
	cardByAuthor: "by {author}",

	// Star rating
	ratingLabel: "Rated {rating} out of 5",

	// Review browse
	browseSearch: "Search",
	browseSearchPlaceholder: "Search...",
	browseGenres: "Genres",
	browseAllGenres: "All Genres",
	browseSelectGenre: "Select a genre",
	browseTags: "Tags",
	browseAllReviews: "All Reviews",
	browseSearchResultsFor: 'Search Results for "{query}"',
	browseGenreHeading: "Genre: {genre}",
	browseTagHeading: "Tag: {tag}",
	browseClearFilters: "Clear Filters",
	browseClearAllFilters: "Clear all filters",
	browseNoResultsTitle: "No reviews found",
	browseNoResultsDescription:
		"Try a different search term, or clear the filters to browse everything.",
	browseSortLabel: "Sort by",
	browseSortRecent: "Most Recent",
	browseSortRating: "Highest Rated",
	browseSortTitle: "Title A–Z",
	paginationLabel: "Pagination",
	paginationPrevious: "Previous",
	paginationNext: "Next",
	paginationPreviousLabel: "Go to previous page",
	paginationNextLabel: "Go to next page",
	paginationMorePages: "More pages",

	// Review detail
	reviewWhatILoved: "What I Loved",
	reviewWhatCouldBeBetter: "What Could Be Better",
	reviewPerfectFor: "Perfect For",
	reviewFavoriteQuotes: "Favorite Quotes",
	reviewPage: "Page {page}",
	reviewTags: "Tags",
	reviewMood: "Mood",
	reviewReadingLog: "Reading Log",
	reviewStarted: "Started",
	reviewFinished: "Finished",
	reviewShareTitle: "Read this review of {title}",
	relatedMoreLikeThis: "More Like This",
	relatedDescription: "Based on genres, tags, and moods you might enjoy.",

	// Share and like
	shareShare: "Share",
	shareCopied: "Copied",
	shareLinkCopied: "Link copied to clipboard",
	shareCopyFailed: "Failed to copy link",
	likeLikes: "Likes",

	// Comments
	commentsTitle: "Comments",
	commentsLoading: "Loading comments...",
	commentsEmpty: "No comments yet. Be the first to share your thoughts!",
	commentsLoadError:
		"Comments could not be loaded right now. Please try again in a moment.",
	commentsRefreshError:
		"The comments could not be refreshed. Showing the ones we already had.",
	commentsFormTitle: "Leave a Comment",
	commentsName: "Name",
	commentsNamePlaceholder: "Your name",
	commentsEmail: "Email",
	commentsEmailPlaceholder: "your@email.com",
	commentsEmailHelp: "Your email won't be published",
	commentsComment: "Comment",
	commentsCommentPlaceholder: "Share your thoughts...",
	commentsSubmit: "Submit Comment",
	commentsSubmitting: "Submitting...",
	commentsSubmitted: "Comment submitted!",
	commentsReport: "Report comment",
	commentsReportPrompt: "Report this comment as inappropriate",
	commentsReportEmailPlaceholder: "Your email (for verification)",
	commentsReportAction: "Report",
	commentsCancel: "Cancel",
	commentsInvalidEmail: "Please enter a valid email",
	commentsReportSubmitted: "Report submitted",

	// Reading lists
	readingListsTitle: "Reading Lists",
	readingListsDescription:
		"Curated collections of books for every mood and occasion.",
	readingListsEmptyTitle: "No reading lists yet",
	readingListsEmptyDescription:
		"Curated collections of reviews are on the way — check back soon.",
	readingListNoReviews: "No reviews added to this list yet.",
	readingListShareTitle: "Check out this reading list: {title}",
	readingListBookSingular: "book",
	readingListBookPlural: "books",

	// About
	aboutTitle: "About Chasing Chapters",
	aboutIntro:
		"A digital sanctuary for book lovers, dedicated to the art of storytelling and the joy of getting lost in a good book.",
	aboutOurStory: "Our Story",
	aboutStoryOne:
		"Chasing Chapters began as a simple reading journal—a place to document thoughts, feelings, and the lingering emotions left behind by a powerful story. Over time, it has evolved into a curated collection of reviews, reading lists, and literary explorations.",
	aboutStoryTwo:
		"We believe that every book has the right reader, and every reader has a soulmate book waiting to be discovered. Our mission is to bridge that gap, offering honest, thoughtful reviews that go beyond simple summaries.",
	aboutStoryThree:
		"Whether you're looking for your next fantasy epic, a cozy mystery to curl up with, or literary fiction that challenges your perspective, you'll find a home here.",
	aboutExploreReviews: "Explore Reviews",
	aboutImageAlt: "A cozy reading corner with vintage books and tea",
	aboutValuesTitle: "What We Value",
	aboutValuesIntro: "The core principles that guide our reading and reviewing.",
	aboutValueHonesty: "Honesty",
	aboutValueHonestyBody:
		"Authentic opinions, always. We celebrate what we love and constructively critique what we don't.",
	aboutValueDiversity: "Diversity",
	aboutValueDiversityBody:
		"Reading widely across genres, cultures, and perspectives to broaden our understanding of the world.",
	aboutValueCommunity: "Community",
	aboutValueCommunityBody:
		"Connecting with fellow bookworms and fostering a shared love for the written word.",

	// Not found
	notFoundChapterMissing: "Chapter Missing",
	notFoundDescription:
		"It seems you've turned to a page that doesn't exist yet. The story continues elsewhere.",
	notFoundReturnHome: "Return Home",
	notFoundBrowseReadingLists: "Browse Reading Lists",

	// Document metadata and feeds
	metaSiteName: "Chasing Chapters",
	metaHomeTitle: "Book Reviews and Reading Lists",
	metaHomeDescription:
		"A digital sanctuary for book lovers, dedicated to the art of storytelling and the joy of getting lost in a good book.",
	metaBrowseTitle: "Browse Reviews",
	metaBrowseDescription:
		"Explore our collection of book reviews. Filter by genre, tag, or search for specific titles and authors.",
	metaReviewDescription:
		"Read our review of {title} by {author}. Rating: {rating}/5 stars.",
	metaReviewNotFound: "Review Not Found",
	metaReadingListDescription: "Curated reading list: {title}",
	metaReadingListNotFound: "Reading List Not Found",
	metaAboutTitle: "About",
	metaAboutDescription:
		"Learn more about Chasing Chapters, a digital sanctuary for book lovers dedicated to the art of storytelling.",
	metaOgImageAlt: "Chasing Chapters — book reviews and reading lists",
	metaFeedDescription:
		"Book reviews, reading lists, and literary notes from Chasing Chapters.",
	browseItemListName: "Book Reviews",
	breadcrumbHome: "Home",
	breadcrumbLabel: "Breadcrumb",
	reviewNavLabel: "Adjacent reviews",
	reviewNavPrevious: "Previous review",
	reviewNavNext: "Next review",

	// Draft preview
	previewLabel: "Preview",
	previewDescription: "You are previewing this review before readers see it.",
	previewOtherLocale: "Read it in {language}",
	previewExit: "Exit preview",
} as const;

/** Every key the interface dictionary defines. */
export type DictionaryKey = keyof typeof en;

/** A complete interface dictionary. */
export type Dictionary = Record<DictionaryKey, string>;

/** The interface strings, in Indonesian. */
const id: Dictionary = {
	skipToContent: "Lewati ke konten",

	navReviews: "Ulasan",
	navReadingLists: "Daftar Bacaan",
	navAbout: "Tentang",
	navWriteReview: "Tulis Ulasan",
	navSearchPlaceholder: "Cari buku...",
	navToggleSearch: "Buka atau tutup pencarian",
	navToggleMenu: "Buka atau tutup menu",
	navMenuTitle: "Navigasi",

	languageGroup: "Bahasa",
	languageEnglish: "English",
	languageIndonesian: "Bahasa Indonesia",

	themeToggle: "Ubah tema",
	themeLight: "Terang",
	themeDark: "Gelap",
	themeSystem: "Sistem",

	footerTagline: "Ruang pribadi bagi para pencinta buku.",
	footerRssLabel: "Umpan RSS ulasan terbaru",
	footerRights: "Seluruh hak cipta dilindungi.",

	homeCuratedReadingLists: "Daftar Bacaan Pilihan",
	homeLatestReviews: "Ulasan Terbaru",
	homeViewAll: "Lihat Semua",
	homeNoReviewsTitle: "Belum ada ulasan",
	homeNoReviewsDescription:
		"Ulasan pertama sedang ditulis — kembali lagi sebentar lagi.",
	heroFeaturedReview: "Ulasan Pilihan",
	heroReadFullReview: "Baca Ulasan Lengkap",
	heroCarouselLabel: "Korsel ulasan pilihan",
	heroPreviousReview: "Ulasan sebelumnya",
	heroNextReview: "Ulasan berikutnya",
	heroGoToSlide: "Buka slide {slide}",
	cardByAuthor: "oleh {author}",

	ratingLabel: "Dinilai {rating} dari 5",

	browseSearch: "Cari",
	browseSearchPlaceholder: "Cari...",
	browseGenres: "Genre",
	browseAllGenres: "Semua Genre",
	browseSelectGenre: "Pilih genre",
	browseTags: "Tag",
	browseAllReviews: "Semua Ulasan",
	browseSearchResultsFor: 'Hasil Pencarian untuk "{query}"',
	browseGenreHeading: "Genre: {genre}",
	browseTagHeading: "Tag: {tag}",
	browseClearFilters: "Hapus Filter",
	browseClearAllFilters: "Hapus semua filter",
	browseNoResultsTitle: "Ulasan tidak ditemukan",
	browseNoResultsDescription:
		"Coba kata kunci lain, atau hapus filter untuk menjelajahi semuanya.",
	browseSortLabel: "Urutkan",
	browseSortRecent: "Terbaru",
	browseSortRating: "Rating Tertinggi",
	browseSortTitle: "Judul A–Z",
	paginationLabel: "Navigasi halaman",
	paginationPrevious: "Sebelumnya",
	paginationNext: "Berikutnya",
	paginationPreviousLabel: "Ke halaman sebelumnya",
	paginationNextLabel: "Ke halaman berikutnya",
	paginationMorePages: "Halaman lainnya",

	reviewWhatILoved: "Yang Saya Sukai",
	reviewWhatCouldBeBetter: "Yang Bisa Lebih Baik",
	reviewPerfectFor: "Cocok Untuk",
	reviewFavoriteQuotes: "Kutipan Favorit",
	reviewPage: "Halaman {page}",
	reviewTags: "Tag",
	reviewMood: "Suasana",
	reviewReadingLog: "Catatan Bacaan",
	reviewStarted: "Mulai",
	reviewFinished: "Selesai",
	reviewShareTitle: "Baca ulasan {title} ini",
	relatedMoreLikeThis: "Mirip Seperti Ini",
	relatedDescription:
		"Berdasarkan genre, tag, dan suasana yang mungkin Anda nikmati.",

	shareShare: "Bagikan",
	shareCopied: "Tersalin",
	shareLinkCopied: "Tautan disalin ke papan klip",
	shareCopyFailed: "Gagal menyalin tautan",
	likeLikes: "Suka",

	commentsTitle: "Komentar",
	commentsLoading: "Memuat komentar...",
	commentsEmpty: "Belum ada komentar. Jadilah yang pertama berbagi pendapat!",
	commentsLoadError:
		"Komentar tidak dapat dimuat saat ini. Silakan coba lagi sebentar lagi.",
	commentsRefreshError:
		"Komentar tidak dapat diperbarui. Menampilkan komentar yang sudah ada.",
	commentsFormTitle: "Tinggalkan Komentar",
	commentsName: "Nama",
	commentsNamePlaceholder: "Nama Anda",
	commentsEmail: "Email",
	commentsEmailPlaceholder: "nama@email.com",
	commentsEmailHelp: "Email Anda tidak akan dipublikasikan",
	commentsComment: "Komentar",
	commentsCommentPlaceholder: "Bagikan pendapat Anda...",
	commentsSubmit: "Kirim Komentar",
	commentsSubmitting: "Mengirim...",
	commentsSubmitted: "Komentar terkirim!",
	commentsReport: "Laporkan komentar",
	commentsReportPrompt: "Laporkan komentar ini sebagai tidak pantas",
	commentsReportEmailPlaceholder: "Email Anda (untuk verifikasi)",
	commentsReportAction: "Laporkan",
	commentsCancel: "Batal",
	commentsInvalidEmail: "Masukkan email yang valid",
	commentsReportSubmitted: "Laporan terkirim",

	readingListsTitle: "Daftar Bacaan",
	readingListsDescription:
		"Kumpulan buku pilihan untuk setiap suasana dan kesempatan.",
	readingListsEmptyTitle: "Belum ada daftar bacaan",
	readingListsEmptyDescription:
		"Kumpulan ulasan pilihan sedang disiapkan — kembali lagi sebentar lagi.",
	readingListNoReviews: "Belum ada ulasan yang ditambahkan ke daftar ini.",
	readingListShareTitle: "Lihat daftar bacaan ini: {title}",
	readingListBookSingular: "buku",
	readingListBookPlural: "buku",

	aboutTitle: "Tentang Chasing Chapters",
	aboutIntro:
		"Ruang digital bagi para pencinta buku, didedikasikan untuk seni bercerita dan kegembiraan tenggelam dalam buku yang baik.",
	aboutOurStory: "Kisah Kami",
	aboutStoryOne:
		"Chasing Chapters bermula sebagai jurnal bacaan sederhana—tempat mencatat pikiran, perasaan, dan emosi yang tertinggal setelah sebuah kisah yang kuat. Seiring waktu, jurnal itu tumbuh menjadi kumpulan ulasan, daftar bacaan, dan penjelajahan sastra yang dikurasi.",
	aboutStoryTwo:
		"Kami percaya setiap buku punya pembacanya, dan setiap pembaca punya buku jodoh yang menunggu untuk ditemukan. Misi kami adalah menjembatani jarak itu dengan ulasan yang jujur dan penuh pertimbangan, melampaui ringkasan biasa.",
	aboutStoryThree:
		"Baik Anda mencari epik fantasi berikutnya, misteri hangat untuk menemani malam, atau fiksi sastra yang menantang cara pandang, Anda akan menemukan rumah di sini.",
	aboutExploreReviews: "Jelajahi Ulasan",
	aboutImageAlt: "Sudut baca yang nyaman dengan buku-buku klasik dan teh",
	aboutValuesTitle: "Nilai yang Kami Pegang",
	aboutValuesIntro:
		"Prinsip utama yang memandu cara kami membaca dan mengulas.",
	aboutValueHonesty: "Kejujuran",
	aboutValueHonestyBody:
		"Opini yang autentik, selalu. Kami merayakan yang kami sukai dan mengkritik secara membangun apa yang tidak.",
	aboutValueDiversity: "Keberagaman",
	aboutValueDiversityBody:
		"Membaca secara luas lintas genre, budaya, dan sudut pandang untuk memperluas pemahaman kami tentang dunia.",
	aboutValueCommunity: "Komunitas",
	aboutValueCommunityBody:
		"Terhubung dengan sesama pencinta buku dan merawat kecintaan bersama pada kata-kata.",

	notFoundChapterMissing: "Bab Tidak Ditemukan",
	notFoundDescription:
		"Sepertinya Anda membuka halaman yang belum ada. Kisahnya berlanjut di tempat lain.",
	notFoundReturnHome: "Kembali ke Beranda",
	notFoundBrowseReadingLists: "Jelajahi Daftar Bacaan",

	metaSiteName: "Chasing Chapters",
	metaHomeTitle: "Ulasan Buku dan Daftar Bacaan",
	metaHomeDescription:
		"Ruang digital bagi para pencinta buku, didedikasikan untuk seni bercerita dan kegembiraan tenggelam dalam buku yang baik.",
	metaBrowseTitle: "Jelajahi Ulasan",
	metaBrowseDescription:
		"Telusuri koleksi ulasan buku kami. Saring berdasarkan genre, tag, atau cari judul dan penulis tertentu.",
	metaReviewDescription:
		"Baca ulasan {title} karya {author}. Rating: {rating}/5 bintang.",
	metaReviewNotFound: "Ulasan Tidak Ditemukan",
	metaReadingListDescription: "Daftar bacaan pilihan: {title}",
	metaReadingListNotFound: "Daftar Bacaan Tidak Ditemukan",
	metaAboutTitle: "Tentang",
	metaAboutDescription:
		"Pelajari lebih lanjut tentang Chasing Chapters, ruang digital bagi para pencinta buku yang didedikasikan untuk seni bercerita.",
	metaOgImageAlt: "Chasing Chapters — ulasan buku dan daftar bacaan",
	metaFeedDescription:
		"Ulasan buku, daftar bacaan, dan catatan sastra dari Chasing Chapters.",
	browseItemListName: "Ulasan Buku",
	breadcrumbHome: "Beranda",
	breadcrumbLabel: "Navigasi remah",
	reviewNavLabel: "Ulasan di sekitarnya",
	reviewNavPrevious: "Ulasan sebelumnya",
	reviewNavNext: "Ulasan berikutnya",

	previewLabel: "Pratinjau",
	previewDescription:
		"Anda sedang melihat pratinjau ulasan ini sebelum pembaca melihatnya.",
	previewOtherLocale: "Baca dalam {language}",
	previewExit: "Keluar dari pratinjau",
};

/** The dictionary for each supported locale. */
const DICTIONARIES: Record<Locale, Dictionary> = { en, id };

/**
 * The interface strings for a locale.
 *
 * The argument is normalized first, so a caller that holds a raw route segment
 * (a string that is not a `Locale`) gets English rather than a runtime error —
 * the same fallback `normalizeLocale` applies everywhere else.
 */
export function getDictionary(locale: unknown): Dictionary {
	return DICTIONARIES[normalizeLocale(locale)];
}
