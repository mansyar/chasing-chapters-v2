import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { Authors } from "./collections/Authors";
import { Media } from "./collections/Media";
import { Genres } from "./collections/Genres";
import { Tags } from "./collections/Tags";
import { MoodTags } from "./collections/MoodTags";
import { Reviews } from "./collections/Reviews";
import { ReadingLists } from "./collections/ReadingLists";
import { Comments } from "./collections/Comments";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  admin: {
    user: Authors.slug,
    importMap: {
      baseDir: path.resolve(dirname),
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
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || "",
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || "",
    },
  }),
  sharp,
  plugins: [
    // storage-adapter-placeholder
  ],
});
