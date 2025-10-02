import Layout from "@/components/Layout";
import AuthedOnly from "@/components/AuthedOnly";
import { useApi } from "@/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "@/utils/auth";
import { useEffect, useState } from "react";

type Project = {
  id: number;
  name: string;
  type: string;
  location: string;
  description: string;
  propertyType: string;
  bedrooms: number;
  createdAt: string;
  ownerUserId: string;
  status: string; // "pending" | "live" | "archived"
};

type Recommendation = {
  id: number;
  name: string | null;
  email: string | null;
  company: string;
  rating: number | null;
  comment: string | null;
  isAnonymous: 0 | 1;
  createdAt: string;
  fromFriend?: 0 | 1;
  fromCommunity?: 0 | 1;
};

// stars
function StarRating({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(5, Math.round(Number(value ?? 0))));
  return (
    <div className="flex gap-0.5" aria-label={`${v} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= v ? "text-yellow-400" : "text-white/30"}>
          ★
        </span>
      ))}
    </div>
  );
}

function Badge({
  children,
  color = "indigo",
}: {
  children: React.ReactNode;
  color?: "green" | "red" | "indigo" | "orange";
}) {
  const shades: Record<string, string> = {
    green: "bg-green-500/15 text-green-300 border-green-600/40",
    red: "bg-red-500/15 text-red-300 border-red-600/40",
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-600/40",
    orange: "bg-orange-500/15 text-orange-300 border-orange-600/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${shades[color]}`}
    >
      {children}
    </span>
  );
}

// Helper: prefer provided name; otherwise "Guest"
const displayRecommender = (r: Recommendation) =>
  r.name && r.name.trim() ? r.name.trim() : "Guest";

export default function ProjectView() {
  const api = useApi();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { id } = router.query;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // shortlist (latest 3)
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [recTotal, setRecTotal] = useState(0);
  const [recsErr, setRecsErr] = useState<string | null>(null);

  // eligibility to add recommendation (server-side decision)
  const [canAddRec, setCanAddRec] = useState(false);

  // fetch project (public endpoint, no auth needed)
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/projects/${id}`);
        setProject(data.project);
      } catch (e: any) {
        setErr(e?.response?.data?.error || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, api]);

  const isOwner = !!(user && project && user.uid === project.ownerUserId);
  const isArchived = (project?.status || "").toLowerCase() === "archived";
  const isLive = (project?.status || "").toLowerCase() === "live";
  const canPublish = isOwner && !isArchived && !isLive;

  // owner actions
  const onPublish = async () => {
    if (!project) return;
    try {
      const { data } = await api.post(`/api/projects/${project.id}/publish`);
      setProject(data.project);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to publish");
    }
  };

  const onArchive = async () => {
    if (!project) return;
    if (!confirm("Archive this project? You’ll find it in Archived projects."))
      return;
    try {
      const { data } = await api.post(`/api/projects/${project.id}/archive`);
      setProject(data.project);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to archive");
    }
  };

  const onUnarchive = async () => {
    if (!project) return;
    try {
      const { data } = await api.post(`/api/projects/${project.id}/unarchive`);
      setProject(data.project);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to unarchive");
    }
  };

  const onCopyInvite = async () => {
    if (!project) return;
    try {
      const { data } = await api.post(`/api/projects/${project.id}/magic-link`);
      await navigator.clipboard.writeText(data.url);
      alert("Invite link copied:\n" + data.url);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Failed to generate link");
    }
  };

  // shortlist (latest 3) — WAIT for auth to be ready and a user to exist.
  useEffect(() => {
    if (!project || authLoading) return;

    if (!user) {
      setRecs([]);
      setRecTotal(0);
      setRecsErr(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(
          `/api/projects/${project.id}/recommendations?page=1&pageSize=3`
        );
        if (!alive) return;
        setRecs(data.items || []);
        setRecTotal(data.total || 0);
        setRecsErr(null);
      } catch (e: any) {
        if (!alive) return;
        const status = e?.status ?? e?.response?.status;
        const msg =
          e?.data?.error ?? e?.response?.data?.error ?? e?.message ?? "";
        if (status === 401 || /missing bearer token/i.test(String(msg))) {
          setRecs([]);
          setRecTotal(0);
          setRecsErr(null);
        } else {
          setRecsErr("Failed to load recommendations");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, project, authLoading, user]);

  // check server-side eligibility for “Add recommendation”
  useEffect(() => {
    if (!project || authLoading || !user) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/api/profile`);
        const hasLoc =
          !!data?.profile?.postcode ||
          !!data?.profile?.postcodeSector ||
          !!data?.profile?.postcodeOutward ||
          !!data?.profile?.city;
        if (alive) setCanAddRec(isLive && hasLoc);
      } catch {
        if (alive) setCanAddRec(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, project, user, isLive, authLoading]);

  return (
    <Layout>
      <AuthedOnly>
        {loading ? (
          <p>Loading...</p>
        ) : err ? (
          <p className="text-red-400">{err}</p>
        ) : (
          project && (
            <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: main details (7/12) */}
              <div className="lg:col-span-7">
                <div className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-semibold mb-2">
                        {project.name}
                      </h1>
                      <p className="text-sm text-zinc-400 mb-4">
                        Created {new Date(project.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {/* Add recommendation CTA when eligible */}
                    {canAddRec && !isOwner && (
                      <Link
                        className="btn"
                        href={`/projects/${project.id}/recommend`}
                      >
                        Add recommendation
                      </Link>
                    )}
                  </div>

                  {isOwner && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      <Link
                        className="btn"
                        href={`/projects/${project.id}/edit`}
                      >
                        Edit
                      </Link>
                      {canPublish && (
                        <button className="btn" onClick={onPublish}>
                          Publish
                        </button>
                      )}
                      {!isArchived && (
                        <button className="btn" onClick={onArchive}>
                          Archive
                        </button>
                      )}
                      {isArchived && (
                        <button className="btn" onClick={onUnarchive}>
                          Unarchive
                        </button>
                      )}
                      {isLive && (
                        <button className="btn" onClick={onCopyInvite}>
                          Copy Invite Link
                        </button>
                      )}
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-zinc-400 text-sm">Type</dt>
                      <dd>{project.type}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 text-sm">Location</dt>
                      <dd>{project.location}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 text-sm">Property</dt>
                      <dd className="capitalize">{project.propertyType}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 text-sm">Bedrooms</dt>
                      <dd>{project.bedrooms}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-400 text-sm">Status</dt>
                      <dd className="capitalize">{project.status}</dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <h2 className="font-semibold mb-1">Description</h2>
                    <p className="whitespace-pre-wrap">{project.description}</p>
                  </div>
                </div>
              </div>

              {/* Right: shortlist (5/12) */}
              <aside className="lg:col-span-5">
                <div className="card">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Shortlist</h2>
                      <p className="text-sm text-zinc-400">
                        A list of builders that have been recommended to you by
                        your friends and community members.
                      </p>
                    </div>
                  </div>

                  <div className="mt-3" />

                  {recsErr ? (
                    <p className="text-sm text-red-400">{recsErr}</p>
                  ) : !recs || recs.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                      No builders have yet been recommended.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-3">
                        {recs.map((r) => (
                          <li
                            key={r.id}
                            className="rounded-lg border border-zinc-800 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="font-medium truncate">
                                {r.company}
                              </div>
                              <StarRating value={r.rating} />
                            </div>

                            {r.comment && (
                              <p className="text-sm text-zinc-300 mt-1 line-clamp-3">
                                {r.comment}
                              </p>
                            )}

                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {r.fromFriend ? (
                                  <Badge color="indigo">Friend</Badge>
                                ) : null}
                                {r.fromCommunity ? (
                                  <Badge color="green">Community</Badge>
                                ) : null}
                              </div>
                              <div className="text-xs text-zinc-400">
                                {new Date(r.createdAt).toLocaleDateString()}
                              </div>
                            </div>

                            <div className="text-xs text-zinc-400 mt-1">
                              {displayRecommender(r)}
                              {r.email ? ` · ${r.email}` : ""}
                            </div>
                          </li>
                        ))}
                      </ul>

                      {recTotal > (recs?.length ?? 0) && (
                        <div className="mt-3">
                          <Link
                            className="btn"
                            href={`/projects/${project.id}/shortlist`}
                          >
                            View more
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
          )
        )}
      </AuthedOnly>
    </Layout>
  );
}
