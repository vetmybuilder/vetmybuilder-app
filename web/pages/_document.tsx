import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Viewport: locks the page to the device width and disables the
            iOS Safari auto-zoom-out-when-content-overflows behaviour, but
            keeps maximum-scale and user-scalable at their defaults so
            pinch-to-zoom and double-tap zoom remain available. iOS still
            won't auto-zoom on input focus because every form control is
            forced to >=16px in globals.css. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
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
        {/* Paint the iOS Safari URL bar / safe-area zones white so the
            keyboard-open gap below the page doesn't flash a different
            colour. Mirrors the manifest theme_color for installed PWA. */}
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
