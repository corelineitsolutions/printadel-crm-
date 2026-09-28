"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { Building2, Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await authAPI.login(data.email, data.password);

      // Backend returns: { success, message, data: { user, token } }
      const { user, token } = response.data.data;

      login(user, token);

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message || "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 p-8 xl:p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full -ml-48 -mb-48" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-white/10 backdrop-blur-sm rounded-xl">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Printadel</h1>
              <p className="text-blue-100 text-sm">Printing & Packaging Operations</p>
            </div>
          </div>

          <div className="mt-16 space-y-6">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 p-6 rounded-2xl">
              <h2 className="text-3xl font-bold text-white mb-4">Welcome Back!</h2>
              <p className="text-blue-50 text-lg leading-relaxed">
                Manage job cards, track attendance & overtime, coordinate print production,
                and streamline operations all in one unified platform.
              </p>
            </div>

            <div className="space-y-4 text-blue-50">
              {[
                "Live Job Card & Press Workflow",
                "Logout Productivity Tracking",
                "Automated Payroll by Employee Type",
                "Real-time Attendance & Overtime System"
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-blue-100 text-sm relative z-10">
          © 2026 Printadel. All rights reserved.
        </p>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 bg-gray-50">
        <div className="w-full max-w-md">
          <Card className="shadow-xl border-0">
            <CardHeader className="space-y-1">
              <div className="lg:hidden flex items-center gap-2 mb-4">
                <Building2 className="w-6 h-6 text-blue-600" />
                <span className="text-xl font-bold">Printadel</span>
              </div>
              <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
              <CardDescription>Access your Printadel account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
                      <Mail className="h-4 w-4 text-gray-400" />
                    </span>
                    <Input
                      {...register("email")}
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-600">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400" />
                    </span>
                    <Input
                      {...register("password")}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pl-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 inset-y-0 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-600">{errors.password.message}</p>
                  )}
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-gray-500 mt-6">
            Secure authentication powered by JWT
          </p>
        </div>
      </div>
    </div>
  );
}
