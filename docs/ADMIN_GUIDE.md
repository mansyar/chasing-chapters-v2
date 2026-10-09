# Chasing Chapters — Admin Guide

A guide for managing your book review website.

---

## Accessing the Admin Panel

1. Navigate to `https://chasing-chapters.com/admin`
2. Log in with your author credentials

---

## Creating a Review

1. Go to **Reviews** in the sidebar
2. Click **Create New**
3. Fill in the required fields:
   - **Title**: Book title
   - **Book Author**: Author name
   - **Rating**: 1-5 stars
   - **Cover Image**: Upload or select from media library
   - **Status**: Draft or Published

### Review Content Sections

- **Review Content**: Main review text
- **What I Loved**: Highlights and positives
- **What Could Be Better**: Constructive feedback
- **Perfect For**: Reader recommendations

### Optional Fields

- **Genres**: Add relevant genres
- **Tags**: Add searchable tags
- **Mood Tags**: Cozy, intense, thought-provoking, etc.
- **Favorite Quotes**: Add memorable quotes
- **Reading Dates**: Start and finish dates
- **Featured**: Toggle to show on homepage

---

## Managing Genres, Tags & Mood Tags

### Creating a Genre

1. Go to **Genres** → **Create New**
2. Enter the name (slug auto-generates)

### Creating Tags

1. Go to **Tags** → **Create New**
2. Enter name and optional description

### Creating Mood Tags

1. Go to **Mood Tags** → **Create New**
2. Enter name and select a color

---

## Managing Media

1. Go to **Media** in the sidebar
2. Click **Upload** to add new images
3. Supported formats: JPG, PNG, WebP, GIF
4. Images are automatically optimized for web

---

## Creating Reading Lists

1. Go to **Reading Lists** → **Create New**
2. Add a title and description
3. Select reviews to include
4. Optionally add a cover image
5. Toggle **Featured** to show on homepage

---

## Moderating Comments

Clean comments auto-approve and appear on the review. A spam-flagged comment from a non-trusted commenter is held as **pending**, and the matched spam signals are saved on the comment. A trusted commenter (3 or more approved comments) bypasses that hold. A banned commenter is rejected. Readers can report a comment; 3 reports mark it **reported**.

The **Comment Moderation** panel on the author analytics dashboard shows pending and reported counts, the latest items, and **Approve** / **Reject**. The counts link into the filtered Comments collection.

### Comment Status

- **Approved**: Visible on the website. Clean comments land here, as do flagged comments from trusted commenters.
- **Pending**: Held for review. The comment was spam-flagged and the commenter is not trusted. Spam signals are stored on the comment.
- **Rejected**: Hidden from the website. Banned commenters are rejected.
- **Reported**: A reader report count has reached 3. Review it from the dashboard panel or the Comments collection.

---

## Publishing Workflow

| Status        | Description                   |
| ------------- | ----------------------------- |
| **Draft**     | Work in progress, not visible |
| **Published** | Live on the website           |

Scheduled publishing is not available.

### To Publish a Review

1. Set status to **Published**
2. Click **Save**
3. Review is immediately live

---

## Indonesian Translation

When a review is published (or its English content is edited after publishing),
the site automatically translates it to Indonesian using the Google Cloud
Translation API.

### How it works

- The **Translation Status** column in the reviews list shows where each review
  stands: `untranslated`, `pending`, `translated`, `failed`, or `stale`.
  - **Stale** means the English content was edited after the last translation
    (e.g. auto-translate is turned off), so the Indonesian version no longer
    matches.
- The edit view sidebar shows the same status, plus the error message when a
  translation **failed**.
- If a translation fails (e.g. the API is temporarily unavailable), the system
  retries up to 3 times. On repeated failure the review is marked **failed**
  and the Indonesian version is left untouched — it never shows a mix of
  English text.

### Auto-translate toggle

- **Auto-translate to Indonesian** (sidebar, on by default): when ON, publishing
  or editing English content triggers translation automatically.
- When OFF, nothing is translated automatically and the status becomes
  **stale** once English content changes — a signal that the Indonesian version
  is out of date.

### Re-translate now

- The **Re-translate** button in the edit view sidebar translates the review on
  demand, regardless of the auto-translate setting, and works on both drafts
  and published reviews.
- The button shows progress and reports success or failure. Status and error
  fields update in place after it finishes.

---

## Tips

- **Save Drafts Often**: Use drafts to save progress
- **Preview**: View reviews before publishing
- **Featured Reviews**: Only 1-3 featured at a time for best impact
- **Image Quality**: Use high-resolution cover images (min 400x600px)
- **SEO**: Your review title and content are used for search optimization

---

## Need Help?

Contact your developer for technical issues or feature requests.
