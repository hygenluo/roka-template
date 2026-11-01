/**
 * 数据契约。
 *
 * 这个文件属于模板仓库，不属于内容仓库——字段一旦被组件依赖，就不能随手改。
 * 兼容规则：新增字段必须是 optional；删除或重命名字段属于破坏性变更，
 * 必须同步提供 scripts/migrate-content.mjs 并升 site.json 的 templateVersion。
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const CONTENT_BASE = './content';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: `${CONTENT_BASE}/blog` }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    series: z.string().optional(),
    seriesOrder: z.number().int().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    difficulty: z.enum(['入门', '进阶', '深入']).optional(),
    draft: z.boolean().default(false),
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `${CONTENT_BASE}/notes` }),
  schema: z.object({
    date: z.coerce.date(),
    title: z.string().optional(),
    kind: z.enum(['life', 'book', 'game', 'film', 'study']),
    rating: z.number().int().min(1).max(5).optional(),
    related: z
      .object({
        type: z.enum(['book', 'game', 'film']),
        title: z.string(),
        creator: z.string().optional(),
        url: z.string().optional(),
      })
      .optional(),
    mood: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `${CONTENT_BASE}/projects` }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    year: z.number().int(),
    status: z.enum(['进行中', '已完成', '归档', '弃坑']),
    type: z.enum(['in-site', 'external']),
    stack: z.array(z.string()).default([]),
    cover: z.string().optional(),
    featured: z.boolean().default(false),
    order: z.number().int().default(100),
    links: z
      .object({
        demo: z.string().optional(),
        repo: z.string().optional(),
        download: z
          .object({
            provider: z.enum(['baidu', 'aliyun', 'quark', 'gdrive', 'other']),
            url: z.string(),
            code: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    lastChecked: z.coerce.date().optional(),
  }),
});

const games = defineCollection({
  loader: glob({ pattern: '**/*.md', base: `${CONTENT_BASE}/games` }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    entry: z.string(),
    cover: z.string().optional(),
    controls: z.string(),
    orientation: z.enum(['any', 'landscape']).default('any'),
    // strict：上传来的第三方 HTML，iframe 不给 allow-same-origin
    // trusted：自己写、随仓库提交的游戏
    sandbox: z.enum(['strict', 'trusted']).default('strict'),
    status: z.enum(['可玩', '开发中', '搁置']),
  }),
});

export const collections = { blog, notes, projects, games };
