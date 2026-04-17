import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Establish connection to Unsplash CDN early so background images
            load faster — browser opens the TCP/TLS handshake before the
            <img> request fires */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://plus.unsplash.com" />
        {/* Home screen icon for iOS */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="VetMyBuilder" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
