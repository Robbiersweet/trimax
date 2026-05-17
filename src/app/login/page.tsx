"use client";

import { useRouter } from "next/navigation";

export default function LoginPage() {

  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-white">

      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">

        <div className="mb-8 text-center">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-2xl font-bold text-black">
            T
          </div>

          <h1 className="mt-5 text-4xl font-bold">
            Welcome Back
          </h1>

          <p className="mt-2 text-zinc-400">
            Sign in to Trimax
          </p>

        </div>

        <form
  className="space-y-5"
  onSubmit={(e) => {
    e.preventDefault();
    router.push("/");
  }}
>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Email
            </label>

            <input
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-orange-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-orange-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-orange-500 py-3 text-lg font-bold text-black transition hover:opacity-90"
          >
            Sign In
          </button>

        </form>

        <div className="mt-6 text-center text-sm text-zinc-500">
          Trimax Operations Platform
        </div>

      </div>

    </main>
  );
}