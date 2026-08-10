import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { LogIn, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message || "Invalid email or password");
      return;
    }

    window.location.href = window.location.origin + "/#/";
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
        backgroundSize: '50px 50px'
      }} />

      <div className="mb-8 flex flex-col items-center relative z-10">
        <img
          src="/logo.png"
          alt="Logo"
          className="h-14 w-auto mb-3"
          onError={(e) => {
            const el = e.currentTarget;
            if (el.src.endsWith("/logo.png")) {
              el.src = "/logo.jpg";
            } else if (el.src.endsWith("/logo.jpg")) {
              el.src = "/logo.webp";
            } else if (el.src.endsWith("/logo.webp")) {
              el.src = "/logo.svg";
            }
          }}
        />
        <h1 className="text-2xl font-bold text-gray-800">Ramaiah Capital</h1>
        <p className="text-sm text-gray-500 mt-1">Ticket Management System</p>
      </div>

      <div className="w-full max-w-[420px] bg-white rounded-xl shadow-lg border border-gray-200 p-8 relative z-10">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Sign in</h2>
        <p className="text-sm text-gray-500 mb-6">
          Use your email and password to access the portal.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-colors pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; 2026 Ramaiah Capital. All rights reserved.
        </p>
      </div>
    </div>
  );
}
