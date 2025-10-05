// web/pages/_app.tsx
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { AuthProvider } from "@/utils/auth";
import Layout from "@/components/Layout";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </AuthProvider>
  );
}
