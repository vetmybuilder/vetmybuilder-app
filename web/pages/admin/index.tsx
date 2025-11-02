import { useEffect } from "react";
import { useRouter } from "next/router";

export default function AdminIndex() {
  const r = useRouter();
  useEffect(() => {
    r.replace("/admin/tradesmen");
  }, [r]);
  return null;
}
