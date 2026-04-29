// web/pages/signup.tsx
import Head from "next/head";
import SignupForm from "@/components/forms/SignupForm";
import GuestOnly from "@/components/GuestOnly";

export default function Signup() {
  return (
    <GuestOnly>
      <>
      <Head>
        <title>Create account - VetMyBuilder</title>
        <meta name="description" content="Create your free VetMyBuilder homeowner account." />
      </Head>

      <div className="fixed inset-0 top-14 bg-white overflow-y-auto">
        <div className="mx-auto max-w-md px-5 pt-6 pb-16" data-testid="register-page">
          {/* Heading block - VMB wordmark already shown by SiteHeader */}
          <div className="mb-6">
            <h1
              className="text-[28px] font-extrabold tracking-[-0.01em] text-slate-900 leading-[1.1]"
              id="register-title"
              data-testid="register-title"
            >
              Find your builder
            </h1>
            <p className="mt-2 text-[13.5px] text-slate-500 leading-snug">
              Free for homeowners. Takes a minute.
            </p>
          </div>

          <SignupForm />
        </div>
      </div>
      </>
    </GuestOnly>
  );
}
