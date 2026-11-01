import { getCollection } from 'astro:content';
import { site } from '../lib/site';

const esc = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function GET(context) {
  const base = (context.site ?? new URL(site.url)).href.replace(/\/$/, '');

  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
  const notes = (await getCollection('notes')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const items = [
    ...posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      date: post.data.pubDate,
      url: `${base}/blog/${post.id}`,
    })),
    ...notes
      .filter((note) => note.data.title)
      .map((note) => ({
        title: note.data.title,
        description: note.data.mood ?? '',
        date: note.data.date,
        url: `${base}/notes/${note.id}`,
      })),
  ].sort((a, b) => b.date.valueOf() - a.date.valueOf());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.title)}</title>
    <description>${esc(site.description)}</description>
    <link>${esc(base)}/</link>
    <language>zh-CN</language>
    <atom:link href="${esc(base)}/rss.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${esc(item.title)}</title>
      <description>${esc(item.description)}</description>
      <link>${esc(item.url)}</link>
      <guid isPermaLink="true">${esc(item.url)}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
    </item>`
  )
  .join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
