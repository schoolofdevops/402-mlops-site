import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Ultimate DevOps to MLOps Bootcamp',
  tagline: 'Take one machine learning model all the way to production, and keep it running.',
  favicon: 'img/favicon.ico',

  url: 'https://schoolofdevops.github.io',
  baseUrl: '/402-mlops-site/',
  organizationName: 'schoolofdevops',
  projectName: '402-mlops-site',

  onBrokenLinks: 'throw',

  future: { v4: true, faster: true },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  markdown: { format: 'detect', mermaid: true, hooks: { onBrokenMarkdownLinks: 'warn' } },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    ['classic', {
      docs: { sidebarPath: './sidebars.ts', routeBasePath: 'docs' },
      blog: false,
      theme: { customCss: './src/css/custom.css' },
    } satisfies Preset.Options],
  ],

  themeConfig: {
    // Hand-drawn/Excalidraw-style diagrams, not Mermaid's default corporate-boxy
    // look — applies to every Mermaid diagram in every lesson automatically.
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
      options: {
        look: 'handDrawn',
        themeVariables: {
          fontFamily: '"Comic Sans MS", "Comic Sans", cursive',
          // Subgraph/cluster containers default to a hachure-filled box — reads
          // fine on light's white page background, turns into illegible noise
          // on dark's near-black background. Drop the fill, keep the sketchy
          // border, in both modes.
          clusterBkg: 'transparent',
          clusterBorder: '#888888',
        },
      },
    },
    navbar: {
      title: 'Ultimate DevOps to MLOps Bootcamp',
      items: [
        { type: 'docSidebar', sidebarId: 'courseSidebar', position: 'left', label: 'Course' },
        { href: 'https://github.com/schoolofdevops/402-mlops', label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        { title: 'Course', items: [{ label: 'Introduction', to: '/docs/intro' }] },
        { title: 'School of DevOps & AI', items: [
          { label: 'GitHub', href: 'https://github.com/schoolofdevops' },
        ]},
      ],
      copyright: `Copyright © ${new Date().getFullYear()} School of DevOps & AI. Built with Docusaurus.`,
    },
    prism: { theme: prismThemes.github, darkTheme: prismThemes.dracula },
  } satisfies Preset.ThemeConfig,
};

export default config;
