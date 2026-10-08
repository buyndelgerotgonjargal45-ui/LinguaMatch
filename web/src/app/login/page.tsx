import { Suspense } from "react";
import { AuthForm } from "@/components/site/auth-form";

export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
