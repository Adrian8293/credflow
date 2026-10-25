import { Html, Head, Main, NextScript } from 'next/document'

// Declares the page language (screen readers pick the right voice and pronunciation from it).
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
