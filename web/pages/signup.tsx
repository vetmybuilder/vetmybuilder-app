// web/pages/signup.tsx
import Head from "next/head";
import SignupForm from "@/components/forms/SignupForm";
import GuestOnly from "@/components/GuestOnly";

export default function Signup() {
  return (
    <GuestOnly>
      <>
      <Head>
        <title>Create account — VetMyBuilder</title>
        <meta name="description" content="Create your free VetMyBuilder homeowner account." />
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden py-24">

          <div className="relative z-10 w-full max-w-md px-4 sm:px-0" data-testid="register-page">
            <div className="bg-white rounded-3xl shadow-xl shadow-zinc-200/60 p-8 sm:p-10">
              <div className="mb-8">
                <h1
                  className="text-3xl font-black tracking-tight text-zinc-900"
                  id="register-title"
                  data-testid="register-title"
                >
                  Create account
                </h1>
                <p className="mt-2 text-zinc-500 text-sm">
                  Join VetMyBuilder — free for homeowners.
                </p>
              </div>

              <SignupForm />
            </div>
          </div>
        </div>
      </div>
      </>
    </GuestOnly>
  );
}
