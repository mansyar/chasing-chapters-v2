"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/authors/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.errors?.[0]?.message || "Login failed");
        setLoading(false);
        return;
      }

      // Redirect to admin dashboard on success
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-neutral-50 p-4 overflow-hidden fixed inset-0">
      <div className="w-full max-w-md bg-white border-2 border-neutral-900 shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold text-black mb-2">
            Chasing Chapters
          </h1>
          <p className="text-black/60 font-medium">
            Admin & Contributor Access
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-bold text-black mb-2"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white border-2 border-neutral-300 text-black placeholder-neutral-400 focus:border-neutral-900 focus:ring-0 outline-none transition-colors"
              placeholder="admin@chasingchapters.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-bold text-black mb-2"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-white border-2 border-neutral-300 text-black placeholder-neutral-400 focus:border-neutral-900 focus:ring-0 outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-neutral-900 text-white font-bold text-lg hover:bg-neutral-800 transition-colors uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};
