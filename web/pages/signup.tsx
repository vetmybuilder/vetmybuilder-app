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
        <style>{`body { background: #fafaf9 !important; }`}</style>
      </Head>

      <div className="overflow-x-hidden -mt-14 min-h-screen">
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-stone-50 py-24">
          {/* Background bands matching homepage hero */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[180%] bg-red-100 rotate-[-12deg] rounded-[60px]" />
            <div className="absolute -bottom-[60%] -left-[30%] w-[70%] h-[120%] bg-emerald-100/80 rotate-[8deg] rounded-[80px]" />
          </div>

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
