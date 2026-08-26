export interface RssChannelInfo {
  title: string;
  description: string;
  link: string;
}

export interface RssItemInput {
  title: string;
  link: string;
  description: string | null;
  guid: string;
  publishedAt: Date;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRssFeed(channel: RssChannelInfo, items: RssItemInput[]): string {
  const itemsXml = items
    .map(
      (item) => `  <item>
    <title>${escapeXml(item.title)}</title>
    <link>${escapeXml(item.link)}</link>
    <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
    <pubDate>${item.publishedAt.toUTCString()}</pubDate>
    ${item.description ? `<description>${escapeXml(item.description)}</description>` : ""}
  </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(channel.title)}</title>
  <link>${escapeXml(channel.link)}</link>
  <description>${escapeXml(channel.description)}</description>
${itemsXml}
</channel>
</rss>
`;
}
