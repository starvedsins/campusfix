"use client";
import { api } from "@/lib/client";
import {
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Leaf,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { Brand, Busy, CampusIllustration, Field, Notice } from "./ui/common";
export function Login({ demo }: { demo: boolean }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      router.replace("/app");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
      setBusy(false);
    }
  }
  const demos = [
    { id: "student", label: "Student", icon: GraduationCap },
    { id: "technician", label: "Technician", icon: Wrench },
    { id: "dispatcher", label: "Dispatcher", icon: Building2 },
    { id: "admin", label: "Administrator", icon: ShieldCheck },
  ];
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div className="login-story-copy">
          <span className="story-kicker">
            <span />A CAMPUS THAT WORKS FOR YOU
          </span>
          <h1>
            Small reports.
            <br />A better campus.
          </h1>
          <p>
            From a flickering light to a leaking tap. Let us know what needs
            care. We will take it from here.
          </p>
          <CampusIllustration />
          <div className="story-points">
            {[
              "Report an issue in minutes",
              "Follow every step of the repair",
              "See the difference you make",
            ].map((text) => (
              <div key={text}>
                <Check size={17} aria-hidden="true" />
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="login-story-footer">
          <Leaf size={16} aria-hidden="true" />
          Built for our campus community.<span>UTech, Jamaica</span>
        </div>
      </section>
      <section className="login-main">
        <div className="login-top">
          <span>UNIVERSITY FACILITIES SERVICES</span>
          <a href="/help">
            Need a hand? <ArrowRight size={14} aria-hidden="true" />
          </a>
        </div>
        <div className="login-form-wrap">
          <div className="login-heading">
            <span className="eyebrow">WELCOME TO CAMPUSFIX</span>
            <h2>Good to see you.</h2>
            <p>Sign in to keep your campus moving.</p>
          </div>
          <form onSubmit={submit} className="form-stack">
            {error && <Notice>{error}</Notice>}
            <Field label="University email or ID" htmlFor="identifier">
              <input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. student@utech.edu.jm"
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="password-input">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <div className="login-help">
              <ShieldCheck size={15} aria-hidden="true" />
              Your account decides which workspace you can use.
            </div>
            <Button type="submit" disabled={busy} className="login-submit">
              {busy ? <Busy /> : null}Sign in
              <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </form>
          {demo && (
            <div className="demo-accounts">
              <div className="divider-label">
                <span />
                EXPLORE THE COURSE DEMO
                <span />
              </div>
              <p>Select an account, then sign in.</p>
              <div className="demo-grid">
                {demos.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={
                      identifier === `${item.id}@utech.edu.jm`
                        ? "demo-choice selected"
                        : "demo-choice"
                    }
                    onClick={() => {
                      setIdentifier(`${item.id}@utech.edu.jm`);
                      setPassword("CampusFix2026!");
                      setError("");
                    }}
                  >
                    <item.icon size={17} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="demo-caption">
                Demo data only. Email and SMS use test records.
              </span>
            </div>
          )}
          <p className="login-policy">
            By signing in, you agree to use this service for campus maintenance
            reports.
          </p>
        </div>
        <footer className="login-footer">
          <span>CampusFix · CIT4001 course project</span>
          <span>Made for a better campus.</span>
        </footer>
      </section>
    </main>
  );
}
