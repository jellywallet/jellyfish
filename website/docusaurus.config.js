/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Jellyfish',
  tagline: 'SDK & Ecosystem for building modern lite DeFi Applications at scale',
  url: 'https://jellyfishsdk.com',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'JellyfishSDK',
  projectName: 'Jellyfish',
  themeConfig: {
    prism: {
      theme: require('prism-react-renderer/themes/github'),
      darkTheme: require('prism-react-renderer/themes/dracula')
    },
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true
    },
    navbar: {
      title: 'Jellyfish',
      logo: {
        alt: 'DeFiChain Logo',
        src: 'img/logo.svg'
      },
      items: [
        {
          to: 'ecosystem',
          activeBasePath: 'ecosystem',
          label: 'Ecosystem',
          position: 'left'
        },
        {
          to: 'node',
          activeBasePath: 'node',
          label: 'Full Node RPC',
          position: 'left'
        },
        {
          to: 'ocean',
          activeBasePath: 'ocean',
          label: 'Ocean REST API',
          position: 'left'
        },
        {
          to: 'legacy',
          activeBasePath: 'legacy',
          label: 'Stats REST API',
          position: 'left'
        },
        {
          to: 'testing/testcontainers',
          activeBasePath: 'testing',
          label: 'Testing',
          position: 'left'
        },
        {
          href: 'https://github.com/JellyfishSDK/jellyfish',
          label: 'GitHub',
          position: 'right'
        }
      ]
    },
    footer: {
      links: [
        {
          title: 'DeFiChain',
          items: [
            {
              label: 'White Paper',
              to: 'https://defichain.com/white-paper/'
            },
            {
              label: 'Pink Paper',
              to: 'https://github.com/DeFiCh/pinkpaper'
            },
            {
              label: 'Developers',
              to: 'https://defichain.com/developers/'
            }
          ]
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Twitter',
              to: 'https://twitter.com/defichain'
            },
            {
              label: 'Reddit',
              to: 'https://reddit.com/r/defiblockchain'
            },
            {
              label: 'GitHub',
              to: 'https://github.com/JellyfishSDK'
            }
          ]
        },
        {
          title: 'Legal',
          items: [
            {
              label: 'Privacy',
              to: 'https://defichain.com/privacy-policy/'
            },
            {
              label: 'MIT License',
              to: 'https://github.com/JellyfishSDK/jellyfish/blob/main/LICENSE'
            }
          ]
        },
        {
          items: [
            {
              html: `
                <a href="https://www.netlify.com" target="_blank" rel="noreferrer noopener" aria-label="Deploys by Netlify">
                  <img src="https://www.netlify.com/img/global/badges/netlify-light.svg" alt="Deploys by Netlify" />
                </a>
              `
            }
          ]
        }
      ],
    }
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          path: '../docs/ecosystem',
          routeBasePath: 'ecosystem',
          editUrl: 'https://github.com/JellyfishSDK/jellyfish/tree/main/website',
          sidebarCollapsed: false,
        },
        theme: {
          customCss: require.resolve('./src/css/theme.css')
        }
      }
    ]
  ],
  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'node',
        path: '../docs/node',
        routeBasePath: 'node',
        editUrl: 'https://github.com/JellyfishSDK/jellyfish/tree/main/website',
        sidebarCollapsed: false,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ocean',
        path: '../docs/ocean',
        routeBasePath: 'ocean',
        editUrl: 'https://github.com/JellyfishSDK/jellyfish/tree/main/website',
        sidebarCollapsed: false,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'testing',
        path: '../docs/testing',
        routeBasePath: 'testing',
        editUrl: 'https://github.com/JellyfishSDK/jellyfish/tree/main/website',
        sidebarCollapsed: false,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'legacy',
        path: '../docs/legacy',
        routeBasePath: 'legacy',
        editUrl: 'https://github.com/JellyfishSDK/jellyfish/tree/main/website',
        sidebarCollapsed: false,
      },
    ],
  ],
}
