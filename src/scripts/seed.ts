import "dotenv/config";
import config from "@payload-config";
import { getPayload } from "payload";

const seed = async () => {
  const payload = await getPayload({ config });

  // Genres (Broad Categories)
  const genres = [
    "Fiction",
    "Non-Fiction",
    "Sci-Fi",
    "Fantasy",
    "Mystery",
    "Romance",
    "Thriller",
    "Historical",
    "Self-Help",
  ];

  // Tags (Specific Topics/Tropes)
  const tags = [
    "Classic",
    "Bestseller",
    "Hidden Gem",
    "Slow Burn",
    "Fast Paced",
    "Plot Twist",
    "Emotional Damage",
    "Beach Read",
  ];

  // Mood Tags (Vibes)
  const moodTags = [
    { name: "Cozy", color: "#FF9F43", icon: "☕" }, // Orange
    { name: "Dark", color: "#2D3436", icon: "🌑" }, // Dark Grey
    { name: "Adventurous", color: "#55EFC4", icon: "🗺️" }, // Green
    { name: "Emotional", color: "#A29BFE", icon: "💧" }, // Purple
    { name: "Funny", color: "#FDCB6E", icon: "😂" }, // Yellow
    { name: "Inspiring", color: "#74B9FF", icon: "✨" }, // Blue
    { name: "Tense", color: "#FF7675", icon: "😬" }, // Red
    { name: "Relaxing", color: "#00CEC9", icon: "🧘" }, // Teal
  ];

  console.log("Seeding Genres...");
  for (const genre of genres) {
    const existing = await payload.find({
      collection: "genres",
      where: {
        name: {
          equals: genre,
        },
      },
    });

    if (existing.totalDocs === 0) {
      await payload.create({
        collection: "genres",
        data: {
          name: genre,
        },
      });
      console.log(`Created Genre: ${genre}`);
    } else {
      console.log(`Genre already exists: ${genre}`);
    }
  }

  console.log("Seeding Tags...");
  for (const tag of tags) {
    const existing = await payload.find({
      collection: "tags",
      where: {
        name: {
          equals: tag,
        },
      },
    });

    if (existing.totalDocs === 0) {
      await payload.create({
        collection: "tags",
        data: {
          name: tag,
        },
      });
      console.log(`Created Tag: ${tag}`);
    } else {
      console.log(`Tag already exists: ${tag}`);
    }
  }

  console.log("Seeding Mood Tags...");
  for (const mood of moodTags) {
    const existing = await payload.find({
      collection: "mood-tags",
      where: {
        name: {
          equals: mood.name,
        },
      },
    });

    if (existing.totalDocs === 0) {
      await payload.create({
        collection: "mood-tags",
        data: {
          name: mood.name,
          color: mood.color,
          icon: mood.icon,
        },
      });
      console.log(`Created Mood Tag: ${mood.name}`);
    } else {
      console.log(`Mood Tag already exists: ${mood.name}`);
    }
  }

  console.log("Seed completed!");
  process.exit(0);
};

seed();
