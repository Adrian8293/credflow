import { Html, Head, Main, NextScript } from 'next/document'
import { THEME_BOOT_SCRIPT } from '../lib/theme.js'

// Declares the page language (screen readers pick the right voice and pronunciation from it).
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Sets the saved/system theme before first paint so dark mode never flashes light. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
