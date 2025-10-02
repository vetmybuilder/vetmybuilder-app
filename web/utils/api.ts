import axios from "axios";
import { initFirebase } from "./firebase";
import { useEffect, useMemo } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export function useApi() {
  const client = useMemo(() => axios.create({ baseURL: base }), []);

  useEffect(() => {
    const auth = initFirebase();

    // attach token before each request
    const reqId = client.interceptors.request.use(async (cfg) => {
      const user = auth.currentUser;
      if (user) {
        const t = await user.getIdToken(false);
        cfg.headers = cfg.headers ?? {};
        cfg.headers.Authorization = `Bearer ${t}`;
      }
      return cfg;
    });

    // if 401, refresh token once and retry
    const resId = client.interceptors.response.use(
      (r) => r,
      async (error) => {
        const original = error?.config;
        const status = error?.response?.status;
        const user = auth.currentUser;
        if (status === 401 && user && !original?._retried) {
          original._retried = true;
          const t = await user.getIdToken(true); // force refresh
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${t}`;
          return client.request(original);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      client.interceptors.request.eject(reqId);
      client.interceptors.response.eject(resId);
    };
  }, [client]);

  return client;
}
