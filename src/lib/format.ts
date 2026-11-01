export const fmtDate = (d: Date): string =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

export const fmtISODate = (d: Date): string => d.toISOString().slice(0, 10);

export const KIND_LABEL: Record<string, string> = {
  life: '日常',
  book: '读书',
  game: '游戏',
  film: '影视',
  study: '学习',
};

/** 把正文压成一行纯文本，用于列表摘要 */
export function excerpt(markdown = '', limit = 96): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

/** 评分渲染成方块，零圆角语言里比星星更贴 */
export function stars(rating?: number): string {
  if (!rating) return '';
  return '■'.repeat(rating) + '□'.repeat(5 - rating);
}

export const byDateDesc = <T extends { data: { date: Date } }>(a: T, b: T): number =>
  b.data.date.valueOf() - a.data.date.valueOf();
