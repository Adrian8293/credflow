import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
    ],
  },
  ...nextVitals,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      '@next/next/no-page-custom-font': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default config
