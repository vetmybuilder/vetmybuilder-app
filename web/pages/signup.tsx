// web/pages/signup.tsx
import Head from "next/head";
import SignupForm from "@/components/forms/SignupForm";

export default function Signup() {
  return (
    <>
      <Head>
        <title>Create account</title>
      </Head>

      <div className="mx-auto max-w-md" data-testid="register-page">
        <h1
          className="mb-4 text-2xl font-semibold"
          id="register-title"
          data-testid="register-title"
        >
          Create account
        </h1>

        <SignupForm />
      </div>
    </>
  );
}
