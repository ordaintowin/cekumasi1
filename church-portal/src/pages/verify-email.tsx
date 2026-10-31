import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type VerificationState = "loading" | "verified" | "error";

export default function VerifyEmail() {
  const [state, setState] = useState<VerificationState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setMessage("This verification link is missing its token. Request a new link from your profile.");
      setState("error");
      return;
    }

    fetch("/api/auth/email-verification/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "This verification link is invalid or expired.");
        setState("verified");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "We could not verify this email.");
        setState("error");
      });
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-950 via-purple-900 to-purple-800 px-4">
      <section className="w-full max-w-md rounded-2xl bg-white p-7 text-center shadow-2xl">
        {state === "loading" ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-purple-700" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">Verifying your email</h1>
            <p className="mt-2 text-sm text-gray-600">Please wait while we confirm this address.</p>
          </>
        ) : state === "verified" ? (
          <>
            <CheckCircle2 className="mx-auto h-11 w-11 text-green-600" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">Email verified</h1>
            <p className="mt-2 text-sm text-gray-600">Your email is ready to use for account recovery.</p>
            <Link href="/login" className="mt-6 inline-flex rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800">
              Go to sign in
            </Link>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-11 w-11 text-red-600" />
            <h1 className="mt-4 text-xl font-bold text-gray-900">Could not verify email</h1>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
            <p className="mt-3 text-sm text-gray-600">If you still need help, contact the church admin.</p>
            <Link href="/login" className="mt-6 inline-flex rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800">
              Go to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
