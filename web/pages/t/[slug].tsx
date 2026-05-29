import Head from "next/head";
import type { GetServerSideProps } from "next";
import ProfileTemplate from "@/components/tradeProfile/ProfileTemplate";
import { getTradeFamily, generateAboutText, TRADE_FAMILIES } from "@/lib/tradeProfileConfig";

type Props = {
  profile: any;
  notFound?: boolean;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug || "");
  const apiBase = process.env.NEXT_INTERNAL_API_BASE || "http://localhost:3100";

  try {
    const res = await fetch(`${apiBase}/api/t/${slug}`);
    if (!res.ok) return { props: { profile: null, notFound: true } };
    const profile = await res.json();
    return { props: { profile } };
  } catch {
    return { props: { profile: null, notFound: true } };
  }
};

export default function PublicProfile({ profile, notFound }: Props) {
  if (notFound || !profile) {
    return (
      <>
        <Head><title>Page not found | VetMyBuilder</title></Head>
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center px-6">
            <h1 className="text-[36px] font-black text-slate-900 mb-2">Page not found</h1>
            <p className="text-slate-500">This tradesperson profile doesn&apos;t exist.</p>
            <a href="/" className="inline-block mt-6 bg-slate-900 text-white px-6 py-3 rounded-xl text-[14px] font-bold">Back to VetMyBuilder</a>
          </div>
        </div>
      </>
    );
  }

  const family = getTradeFamily(profile.template);
  const config = TRADE_FAMILIES[family] || TRADE_FAMILIES.general;
  const areas = (profile.service_areas || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const aboutText = profile.about || generateAboutText(profile.template, profile.company_name, areas.join(", "));
  const photos = profile.photo_urls?.length ? profile.photo_urls : config.stockPhotos;

  const title = `${profile.company_name} - ${config.label} in ${areas[0] || "your area"} | VetMyBuilder`;
  const description = `${profile.company_name} is a verified ${config.label.toLowerCase()} specialist serving ${areas.join(", ")}. View portfolio, recommendations, and get in touch.`;
  const ogImage = profile.profile_picture_url || photos[0];

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`https://vetmybuilder.com/t/${profile.slug}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://vetmybuilder.com/t/${profile.slug}`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: profile.company_name,
              description,
              url: `https://vetmybuilder.com/t/${profile.slug}`,
              image: ogImage,
              address: { "@type": "PostalAddress", addressRegion: areas[0] || "" },
              ...(profile.google_rating
                ? {
                    aggregateRating: {
                      "@type": "AggregateRating",
                      ratingValue: profile.google_rating,
                      reviewCount: profile.google_reviews_count,
                    },
                  }
                : {}),
            }),
          }}
        />
      </Head>
      <ProfileTemplate profile={profile} aboutText={aboutText} photos={photos} config={config} />
    </>
  );
}
