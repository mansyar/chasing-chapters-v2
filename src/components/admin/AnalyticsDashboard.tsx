import type { AdminViewComponent } from "payload";
import { DefaultTemplate } from "@payloadcms/next/templates";
import { Gutter } from "@payloadcms/ui";
import React from "react";
import { getPayload } from "payload";
import configPromise from "@payload-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Heart, Star, BookOpen } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AnalyticsDashboard: AdminViewComponent = async ({
  user,
  payload: { config },
}: any) => {
  const payload = await getPayload({ config: configPromise });

  // 1. Fetch Reviews
  // If admin, fetch all. If writer, fetch only theirs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (user.role === "writer") {
    where.author = {
      equals: user.id,
    };
  }

  const { docs: reviews } = await payload.find({
    collection: "reviews",
    where,
    limit: 1000,
    sort: "-views", // sort by views mostly
  });

  // 2. Calculate Stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalViews = reviews.reduce(
    (acc, r) => acc + ((r as any).views || 0),
    0
  );
  const totalLikes = reviews.reduce((acc, r) => acc + (r.likes || 0), 0);
  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(
          1
        )
      : "N/A";

  // 3. Top Reviews
  const topReviews = reviews.slice(0, 5);

  return (
    <DefaultTemplate
      payloadConfig={config}
      visibleEntities={{
        collections: ["reviews"],
        globals: [],
      }}
    >
      <Gutter>
        <div className="py-8 space-y-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Author Analytics 📊
          </h1>
          <p className="text-muted-foreground">
            Overview of your content performance.
          </p>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Total Views"
              value={totalViews}
              icon={<Eye className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsCard
              title="Total Likes"
              value={totalLikes}
              icon={<Heart className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsCard
              title="Published Reviews"
              value={totalReviews}
              icon={<BookOpen className="h-4 w-4 text-muted-foreground" />}
            />
            <StatsCard
              title="Avg Rating"
              value={avgRating}
              icon={<Star className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Top Performing Reviews</h2>
            <div className="rounded-md border">
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Title
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Views
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Likes
                      </th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">
                        Rating
                      </th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {topReviews.map((review) => (
                      <tr
                        key={review.id}
                        className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                      >
                        <td className="p-4 align-middle font-medium">
                          {review.title}
                        </td>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <td className="p-4 align-middle">
                          {(review as any).views || 0}
                        </td>
                        <td className="p-4 align-middle">
                          {review.likes || 0}
                        </td>
                        <td className="p-4 align-middle">{review.rating}/5</td>
                      </tr>
                    ))}
                    {topReviews.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-4 text-center text-muted-foreground"
                        >
                          No reviews found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </Gutter>
    </DefaultTemplate>
  );
};

function StatsCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
