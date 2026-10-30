"use client";
import { api, ApiError } from "@/lib/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
export function useResource<T>(url: string, interval = 0) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const load = () => {
      api<T>(url)
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
            setLoading(false);
          }
        })
        .catch((error) => {
          if (active) {
            setError(
              error instanceof Error
                ? error.message
                : "This page could not be loaded.",
            );
            setLoading(false);
            if (error instanceof ApiError && error.status === 401)
              router.replace("/login");
          }
        });
    };
    load();
    const timer = interval ? setInterval(load, interval) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [url, interval, revision, router]);
  return { data, error, loading, refresh };
}
