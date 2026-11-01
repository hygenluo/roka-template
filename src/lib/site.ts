import siteData from '../../content/site.json';

export interface NavItem {
  label: string;
  href: string;
}

export interface SiteConfig {
  title: string;
  tagline: string;
  description: string;
  url: string;
  author: { name: string; bio: string; avatar?: string };
  about?: string[];
  nav: NavItem[];
  social: NavItem[];
  templateVersion: number;
}

export const site = siteData as SiteConfig;

export const isActive = (href: string, path: string): boolean =>
  href === '/' ? path === '/' : path.startsWith(href);
