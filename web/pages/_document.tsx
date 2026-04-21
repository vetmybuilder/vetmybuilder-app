import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Establish connection to Unsplash CDN early so background images
            load faster — browser opens the TCP/TLS handshake before the
            <img> request fires */}
        {/* Google Fonts — Sora (headings/body) + Indie Flower (accent) + Caveat (bold accent) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&family=Indie+Flower&family=Caveat:wght@400;700&display=swap" rel="stylesheet" />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://plus.unsplash.com" />
        {/* PWA manifest + home screen icon */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
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
