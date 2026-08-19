"use client";

import { useEffect, useMemo, useState } from "react";
import RequireEntered from "@/components/RequireEntered";
import NavBar from "@/components/NavBar";
import {
  getDevaluationAlerts,
  getBanks,
  getLoyaltyPrograms,
} from "@/lib/queries";
import type { DevaluationAlert, Bank, LoyaltyProgram } from "@/lib/types";
import Logo from "@/components/Logo";

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-950 text-red-300 border border-red-900",
  medium: "bg-amber-950 text-amber-300 border border-amber-900",
  low: "bg-slate-900 text-slate-400 border border-slate-800",
};

export default function AlertsPage() {
  return (
    <RequireEntered>
      <NavBar />
      <AlertsBody />
    </RequireEntered>
  );
}

function AlertsBody() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<DevaluationAlert[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [a, b, p] = await Promise.all([
          getDevaluationAlerts(),
          getBanks(),
          getLoyaltyPrograms(),
        ]);
        setAlerts(a);
        setBanks(b);
        setPrograms(p);
      } catch (e: any) {
        setError(e.message ?? "Failed to load devaluation alerts");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const bankById = new Map(banks.map((b) => [b.id, b]));
  const programById = new Map(programs.map((p) => [p.id, p]));

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcoming = alerts.filter((a) => a.effective_date && a.effective_date > today);
  const past = alerts.filter((a) => !a.effective_date || a.effective_date <= today);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-50">Devaluation Alerts</h1>
      <p className="mt-1 text-sm text-slate-500">
        Confirmed pricing and partner changes to loyalty programs and issuer
        transfer relationships, sourced from the issuer or a dated report.
        Nothing here is a prediction — every alert links to where it came from.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 h-48 animate-pulse rounded-xl bg-base-800" />
      ) : alerts.length === 0 ? (
        <div className="card-surface mt-8 rounded-xl p-8 text-center text-sm text-slate-500">
          No confirmed devaluations on record right now.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Upcoming
              </h2>
              <div className="space-y-3">
                {upcoming.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    bank={a.bank_id ? bankById.get(a.bank_id) : undefined}
                    program={a.program_id ? programById.get(a.program_id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Already in effect
              </h2>
              <div className="space-y-3">
                {past.map((a) => (
                  <AlertCard
                    key={a.id}
                    alert={a}
                    bank={a.bank_id ? bankById.get(a.bank_id) : undefined}
                    program={a.program_id ? programById.get(a.program_id) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function AlertCard({
  alert,
  bank,
  program,
}: {
  alert: DevaluationAlert;
  bank?: Bank;
  program?: LoyaltyProgram;
}) {
  const severity = (alert.severity ?? "low").toLowerCase();
  const entityName = program?.program_name ?? bank?.bank_name ?? null;

  return (
    <div className="card-surface rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {entityName && (
            <Logo
              src={program?.logo_url ?? bank?.icon_url}
              name={entityName}
              size={28}
            />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-slate-100">{alert.title}</h3>
              <span className={`pill text-xs ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.low}`}>
                {severity} impact
              </span>
            </div>
            {entityName && (
              <div className="mt-0.5 text-xs text-slate-500">{entityName}</div>
            )}
          </div>
        </div>
      </div>

      {alert.summary && (
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{alert.summary}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {alert.effective_date && (
          <span>
            Effective{" "}
            {new Date(alert.effective_date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
        {alert.announced_date && (
          <span>
            Announced{" "}
            {new Date(alert.announced_date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
        {alert.source_link && (
          <a
            href={alert.source_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-400 hover:underline"
          >
            Source ↗
          </a>
        )}
      </div>
    </div>
  );
}
