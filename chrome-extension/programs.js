// Hostname -> program_code lookup. This is the ONLY thing that needs an
// edit to support another loyalty program — one line, no new extractor
// code, no manifest change (loyalty-content.js already runs on every page
// via <all_urls>, same as content.js does for merchant detection).
//
// program_code must match the `program_code` column in the loyalty_programs
// table (see GET /api/extension/programs for the live, authoritative list).
//
// A hostname can appear more than once (e.g. a program with two domains);
// first match wins.
self.QN_PROGRAM_HOSTS = [
  // --- v1 test batch ---
  { hosts: ["aircanada.com", "aeroplan.aircanada.com"], program: "aeroplan" },
  { hosts: ["britishairways.com", "executiveclub.britishairways.com"], program: "avios" },
  { hosts: ["accor.com", "all.accor.com", "accorhotels.com"], program: "accor_all" },
  { hosts: ["marriott.com", "members.marriott.com"], program: "marriott_bonvoy" },
  { hosts: ["makemytrip.com"], program: "makemytrip_tier" },
  { hosts: ["airindia.com", "www.airindia.com"], program: "ai_maharaja" },

  // --- add more programs here, one line each, no other changes needed ---
  // { hosts: ["singaporeair.com"], program: "krisflyer" },
  // { hosts: ["hilton.com"], program: "hilton_honors" },
];

// Resolve the current hostname (with or without "www.") to a program_code,
// or null if this page isn't a known loyalty program site.
self.qnResolveProgram = function qnResolveProgram(hostname) {
  const host = String(hostname || "").replace(/^www\./, "").toLowerCase();
  for (const entry of self.QN_PROGRAM_HOSTS) {
    if (entry.hosts.some((h) => host === h || host.endsWith("." + h))) {
      return entry.program;
    }
  }
  return null;
};
