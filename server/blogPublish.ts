import { createBlogPost, updateBlogPost, getShopifyConfig } from "./db";
import { getShopifyClient } from "./shopify";
import { decryptCredential } from "./crypto";
import { notifyOwner } from "./_core/notification";

type GeneratedPost = {
  title: string;
  slug?: string;
  content: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  tags: string[];
  featuredImageUrl?: string;
  featuredImageAlt?: string;
};

/**
 * Saves a generated post as a draft, then — only if autoPublish is set —
 * genuinely attempts to publish it to the connected Shopify blog. The
 * post is marked "published" only when the Shopify article call actually
 * succeeds; otherwise it stays a draft rather than claiming to be live
 * when nothing reached Shopify. Shared by both the autonomous "Run Now"
 * trigger and the scheduled cron path so they can't drift apart again.
 */
export async function createAndPublishBlogPost(
  post: GeneratedPost,
  autoPublish: boolean
): Promise<{ postId: number; published: boolean }> {
  const postId = await createBlogPost({
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    tags: post.tags,
    featuredImageUrl: post.featuredImageUrl,
    featuredImageAlt: post.featuredImageAlt,
    status: "draft",
    generatedByAi: true,
  } as any);

  if (!autoPublish) {
    return { postId, published: false };
  }

  const config = await getShopifyConfig();
  if (config?.isConnected) {
    try {
      const client = await getShopifyClient(
        config.storeDomain,
        decryptCredential(config.accessToken) ?? config.accessToken
      );
      const blogs = await client.getBlogs();
      const blogId = blogs.blogs[0]?.id;
      if (blogId) {
        const article = await client.createArticle(blogId, {
          title: post.title,
          body_html: post.content || "",
          summary_html: post.excerpt || "",
          tags: post.tags.join(", "),
          image: post.featuredImageUrl ? { src: post.featuredImageUrl, alt: post.title } : undefined,
          published: true,
        });
        await updateBlogPost(postId, {
          status: "published",
          publishedAt: new Date(),
          shopifyBlogId: blogId,
          shopifyArticleId: article.article.id,
        });
        return { postId, published: true };
      }
      // Connected but no blog found — surface it instead of silently drafting.
      await notifyOwner({
        module: "blog",
        title: "Blog auto-publish skipped: no Shopify blog found",
        content: `"${post.title}" was saved as a draft because your Shopify store has no blog to publish to. Create a blog in Shopify (Online Store → Blog posts) to enable auto-publishing.`,
      }).catch(() => {});
    } catch (err: any) {
      // Publish was requested but failed — the post is stranded as a draft.
      // Tell the owner rather than reporting success upstream.
      console.warn("[Blog] Autonomous Shopify publish failed:", err.message);
      await notifyOwner({
        module: "blog",
        title: "Blog auto-publish failed",
        content: `"${post.title}" was generated but could not be published to Shopify (${err.message}). It's saved as a draft — review it under Blog.`,
      }).catch(() => {});
    }
  }

  return { postId, published: false };
}
