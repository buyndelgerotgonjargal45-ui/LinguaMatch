import { Suspense } from "react";
import { AuthForm } from "@/components/site/auth-form";

export default function SignupPage() {
  return (
    <Suspense>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
