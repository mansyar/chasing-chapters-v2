import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { s3Storage } from "@payloadcms/storage-s3";
import path from "path";
import { buildConfig } from "payload";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { Authors } from "./collections/Authors";
import { Commenters } from "./collections/Commenters";
import { Comments } from "./collections/Comments";
import { Genres } from "./collections/Genres";
import { Media } from "./collections/Media";
import { MoodTags } from "./collections/MoodTags";
import { ReadingLists } from "./collections/ReadingLists";
import { Reviews } from "./collections/Reviews";
import { Tags } from "./collections/Tags";
import { env } from "./lib/env";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
	localization: {
		locales: [
			{ label: "English", code: "en" },
			{ label: "Indonesia", code: "id" },
		],
		defaultLocale: "en",
		fallback: true,
	},
	admin: {
		user: Authors.slug,
		dateFormat: "MMMM d, yyyy",
		importMap: {
			baseDir: path.resolve(dirname),
		},
		components: {
			providers: ["@/components/AdminStyleProvider#AdminStyleProvider"],
			views: {
				login: {
					Component: "@/components/AdminLogin#AdminLogin",
				},
				dashboard: {
					Component: "@/components/admin/AnalyticsDashboard#AnalyticsDashboard",
				},
			},
		},
	},
	collections: [
		Authors,
		Media,
		Genres,
		Tags,
		MoodTags,
		Reviews,
		ReadingLists,
		Comments,
		Commenters,
	],
	editor: lexicalEditor(),
	secret: env.PAYLOAD_SECRET,
	typescript: {
		outputFile: path.resolve(dirname, "payload-types.ts"),
	},
	db: postgresAdapter({
		pool: {
			connectionString: env.DATABASE_URI,
			// Keep connections alive to prevent "Connection terminated unexpectedly"
			keepAlive: true,
			// Close idle connections after 20 seconds (helps with serverless DB idle timeouts)
			idleTimeoutMillis: 20000,
			// Timeout for acquiring new connections
			connectionTimeoutMillis: 10000,
			// Limit pool size for serverless environments
			max: 10,
			min: 2,
		},
	}),
	sharp,
	plugins: [
		s3Storage({
			collections: {
				media: true,
			},
			bucket: env.R2_BUCKET,
			config: {
				endpoint: env.R2_ENDPOINT,
				region: "auto",
				credentials: {
					accessKeyId: env.R2_ACCESS_KEY_ID,
					secretAccessKey: env.R2_SECRET_ACCESS_KEY,
				},
			},
		}),
	],
});
