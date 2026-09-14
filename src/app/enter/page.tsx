import { Suspense } from "react";
import { EnterForm } from "@/components/EnterForm";

export default function EnterPage() {
  return (
    <Suspense>
      <EnterForm />
    </Suspense>
  );
}
