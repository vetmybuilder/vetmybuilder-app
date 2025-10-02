import { useAuth } from "@/utils/auth";
import { useEffect, useState } from "react";

export default function AuthDebug() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!user) return setClaims(null);
      const t = await user.getIdToken();
      setClaims(JSON.parse(atob(t.split(".")[1])));
    })();
  }, [user]);

  if (!user) return <div className="p-6">Not signed in</div>;
  return (
    <div className="p-6 space-y-2">
      <div>
        <b>UID:</b> {user.uid}
      </div>
      <div>
        <b>Email:</b> {user.email ?? "—"}
      </div>
      <pre className="text-xs bg-black/20 p-3 rounded">
        {JSON.stringify(claims, null, 2)}
      </pre>
    </div>
  );
}
