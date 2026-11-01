/**
 * 把 theme.json 的"档位"翻译成 CSS 变量。
 *
 * 内容仓库只能选档位，不能写样式——设计系统属于模板，取值属于内容。
 * 这里就是两者唯一的那道接口。
 */
import themeData from '../../content/theme.json';

const ACCENT: Record<string, string> = {
  marker: '#E9E45E',
  jade: '#3F7A5E',
  indigo: '#1B4F8A',
  clay: '#B4552F',
  moss: '#4F6B3A',
  plum: '#6B3F6B',
};

const INK: Record<string, string> = {
  graphite: '#15181B',
  navy: '#141B2B',
};

const SERIF: Record<string, string> = {
  'noto-serif': '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  'source-serif': '"Source Serif 4", "Source Han Serif SC", "Songti SC", serif',
};

interface ThemeInput {
  accent?: string;
  ink?: string;
  serif?: string;
  width?: string | number;
  darkDefault?: string;
  radius?: string | number;
}

export const theme = themeData as ThemeInput;

export function themeCss(t: ThemeInput = theme): string {
  const accent = ACCENT[String(t.accent)] ?? ACCENT.marker;
  const ink = INK[String(t.ink)] ?? INK.graphite;
  const serif = SERIF[String(t.serif)] ?? SERIF['noto-serif'];
  const width = Number(t.width) || 68;
  const radius = Number(t.radius) || 0;

  return `:root{--theme-accent:${accent};--theme-ink:${ink};--theme-serif:${serif};--measure:${width}ch;--radius:${radius}px}`;
}

/** 首屏之前就要定暗色，避免闪一下白 */
export function themeBootstrap(): string {
  const mode = String(theme.darkDefault ?? 'auto');
  return `(()=>{try{const s=localStorage.getItem('theme');const m=s||${JSON.stringify(mode)};const d=m==='dark'||(m==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;
}
