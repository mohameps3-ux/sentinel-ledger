import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* viewport lives in pages/_app.jsx <Head> so it ships with the app shell and avoids duplicate tags */}
        {/* Reduces Chrome auto-translate mangling tickers (JUP → “jump”) and mint hints */}
        <meta name="google" content="notranslate" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
