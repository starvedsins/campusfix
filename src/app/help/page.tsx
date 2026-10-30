import { Brand } from "@/components/ui/common";
import Link from "next/link";
export default function Help() {
  return (
    <main className="help-page">
      <Brand />
      <div className="help-content">
        <span className="eyebrow">CAMPUSFIX HELP</span>
        <h1>A little help goes a long way.</h1>
        <h2>Report a campus issue</h2>
        <p>
          Sign in with your university account. Select Report an issue. Choose
          the exact location and category. Add a clear description and an
          optional JPG or PNG photo up to 4.5 MB.
        </p>
        <h2>Follow a repair</h2>
        <p>
          Open My reports to see the current status. You can add comments and
          check the activity history. When work is complete, confirm the repair
          or select Report a problem.
        </p>
        <h2>Use the course demo</h2>
        <p>
          The sign-in page has demo accounts for students, technicians,
          dispatchers, and administrators. All records are for testing. Email
          and SMS delivery records are test records.
        </p>
        <h2>When your connection stops</h2>
        <p>
          A report form that is already open can save a draft or queue a
          submission. Keep the application open or return when the connection is
          back. CampusFix checks your sign-in before it sends queued reports.
        </p>
        <h2>Account help</h2>
        <p>
          Ask your course demonstration administrator to unlock or activate your
          account. This project has no connection to the official university
          account system.
        </p>
        <h2>Immediate hazards</h2>
        <p>
          Move away from danger and use the established university emergency
          contact process. This course demonstration is not monitored by campus
          emergency staff.
        </p>
        <Link className="btn btn-primary" href="/login">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
