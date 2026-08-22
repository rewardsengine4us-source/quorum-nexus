// The only program-specific file in the extension: hostname -> program_code.
//
// Everything else (extractor.js, loyalty-content.js, background.js) is
// generic, so supporting a new program means adding one line here and
// nothing else. No new content script, no new host permission — the
// manifest already matches <all_urls> and the extractor is shared.
//
// program_code values must match loyalty_programs.program_code in the
// database, because that is what /api/extension/sync-points resolves
// against. A typo here is a silent no-op, not an error, so they are worth
// checking against the table rather than eyeballing.
//
// Matching is on the registrable domain and any subdomain, so listing
// "marriott.com" also covers "members.marriott.com". List extra hosts only
// where a program genuinely uses an unrelated domain for its account area.

self.QN_PROGRAM_HOSTS = [
  /* ---------------- Airlines: India ---------------- */
  { hosts: ["airindia.com", "airindiaexpress.com"], program: "ai_maharaja" },
  { hosts: ["goindigo.in", "indigo.in"], program: "indigo_bluchip" },
  { hosts: ["airvistara.com"], program: "vistara_club" },
  { hosts: ["spicejet.com"], program: "spicejet_tier" },
  { hosts: ["akasaair.com"], program: "akasa_rewards" },

  /* ---------------- Airlines: Asia-Pacific ---------------- */
  { hosts: ["singaporeair.com", "krisflyer.com"], program: "krisflyer" },
  { hosts: ["flyscoot.com"], program: "scoot_krisflyer" },
  { hosts: ["cathaypacific.com", "asiamiles.com"], program: "cathay_miles" },
  { hosts: ["ana.co.jp"], program: "ana_miles" },
  { hosts: ["jal.co.jp", "jal.com"], program: "jal_miles" },
  { hosts: ["koreanair.com"], program: "korean_skypass" },
  { hosts: ["thaiairways.com"], program: "thai_frequent" },
  { hosts: ["malaysiaairlines.com", "enrich.malaysiaairlines.com"], program: "malaysia_enrich" },
  { hosts: ["garuda-indonesia.com"], program: "garuda_miles" },
  { hosts: ["vietnamairlines.com"], program: "vietnam_lotusmiles" },
  { hosts: ["srilankan.com"], program: "srilankan_flysmiles" },
  { hosts: ["bangkokair.com"], program: "bangkok_flyerbonus" },
  { hosts: ["airasia.com"], program: "airasia_rewards" },
  { hosts: ["evaair.com"], program: "eva_infinity" },
  { hosts: ["china-airlines.com"], program: "china_airlines_dynasty" },
  { hosts: ["csair.com"], program: "china_southern_skypearl" },
  { hosts: ["ceair.com"], program: "china_eastern_esm" },
  { hosts: ["hainanairlines.com"], program: "hainan_fortune_wings" },
  { hosts: ["philippineairlines.com"], program: "philippine_mabuhay" },
  { hosts: ["flyroyalbrunei.com"], program: "royalbrunei_royalskies" },
  { hosts: ["airnewzealand.com", "airnewzealand.co.nz"], program: "airnz_airpoints" },
  { hosts: ["qantas.com"], program: "qantas_ff" },
  { hosts: ["nepalairlines.com.np"], program: "nepal_flyingnepal" },

  /* ---------------- Airlines: Middle East ---------------- */
  { hosts: ["qatarairways.com"], program: "qatar_miles" },
  { hosts: ["emirates.com"], program: "emirates_skywards" },
  { hosts: ["etihad.com"], program: "etihad_guest" },
  { hosts: ["omanair.com"], program: "oman_sindbad" },
  { hosts: ["gulfair.com"], program: "gulfair_falconflyer" },
  { hosts: ["saudia.com"], program: "saudia_alfursan" },
  { hosts: ["kuwaitairways.com"], program: "kuwait_oasis" },
  { hosts: ["rj.com"], program: "royaljordanian_royalclub" },
  { hosts: ["flydubai.com"], program: "flydubai_open" },
  { hosts: ["airarabia.com"], program: "airarabia_airewards" },

  /* ---------------- Airlines: Europe ---------------- */
  { hosts: ["britishairways.com"], program: "avios" },
  { hosts: ["airfrance.com", "airfrance.co.in", "flyingblue.com", "klm.com"], program: "flying_blue" },
  { hosts: ["lufthansa.com", "miles-and-more.com"], program: "lufthansa_miles" },
  { hosts: ["turkishairlines.com"], program: "turkish_miles" },
  { hosts: ["virginatlantic.com"], program: "virgin_points" },
  { hosts: ["iberia.com"], program: "iberia_plus" },
  { hosts: ["finnair.com"], program: "finnair_plus" },
  { hosts: ["lot.com"], program: "lot_miles" },
  { hosts: ["aegeanair.com"], program: "aegean_miles" },
  { hosts: ["flytap.com"], program: "tap_miles" },
  { hosts: ["flysas.com"], program: "sas_eurobonus" },
  { hosts: ["aerlingus.com"], program: "aerlingus_aerclub" },
  { hosts: ["icelandair.com"], program: "icelandair_saga" },
  { hosts: ["airserbia.com"], program: "airserbia_etihad" },

  /* ---------------- Airlines: Americas ---------------- */
  { hosts: ["united.com"], program: "united_mpx" },
  { hosts: ["aa.com"], program: "american_aa" },
  { hosts: ["delta.com"], program: "delta_skymiles" },
  { hosts: ["southwest.com"], program: "southwest_rapid" },
  { hosts: ["jetblue.com"], program: "jetblue_trueblue" },
  { hosts: ["alaskaair.com"], program: "alaska_miles" },
  { hosts: ["hawaiianairlines.com"], program: "hawaiian_miles" },
  { hosts: ["aircanada.com", "aeroplan.com"], program: "aeroplan" },
  { hosts: ["westjet.com"], program: "westjet_rewards" },
  { hosts: ["latamairlines.com"], program: "latam_pass" },
  { hosts: ["avianca.com", "lifemiles.com"], program: "avianca_lifemiles" },
  { hosts: ["aeromexico.com"], program: "aeromexico_rewards" },
  { hosts: ["copaair.com"], program: "copa_connect" },

  /* ---------------- Airlines: Africa ---------------- */
  { hosts: ["ethiopianairlines.com"], program: "ethiopian_shebamiles" },
  { hosts: ["kenya-airways.com"], program: "kenya_asante" },
  { hosts: ["flysaa.com"], program: "southafrican_voyager" },
  { hosts: ["airmauritius.com"], program: "airmauritius_kestrelflyer" },
  { hosts: ["airseychelles.com"], program: "airseychelles_seychelles" },

  /* ---------------- Hotels ---------------- */
  { hosts: ["marriott.com", "marriott.co.in"], program: "marriott_bonvoy" },
  { hosts: ["ihg.com"], program: "ihg_one" },
  { hosts: ["hilton.com"], program: "hilton_honors" },
  { hosts: ["accor.com", "all.accor.com", "accorhotels.com"], program: "accor_all" },
  { hosts: ["hyatt.com"], program: "hyatt_gold" },
  { hosts: ["radissonhotels.com"], program: "radisson_rewards" },
  { hosts: ["wyndhamhotels.com"], program: "wyndham_rewards" },
  { hosts: ["choicehotels.com"], program: "choice_privileges" },
  { hosts: ["bestwestern.com"], program: "bestwestern_rewards" },
  { hosts: ["tajhotels.com"], program: "taj_innercircle" },
  { hosts: ["oberoihotels.com"], program: "oberoi_circle" },
  { hosts: ["itchotels.com", "itcportal.com"], program: "itc_rewards" },
  { hosts: ["theleela.com"], program: "leela_discovery" },
  { hosts: ["lemontreehotels.com"], program: "lemontree_smiles" },
  { hosts: ["sarovarhotels.com"], program: "sarovar_rewards" },
  { hosts: ["fortunehotels.in"], program: "fortune_rewards" },
  { hosts: ["clubmahindra.com"], program: "clubmahindra_points" },
  { hosts: ["sterlingholidays.com"], program: "sterling_holidays" },
  { hosts: ["shangri-la.com"], program: "shangrila_circle" },
  { hosts: ["jumeirah.com"], program: "jumeirah_one" },
  { hosts: ["mandarinoriental.com"], program: "mandarin_fans" },
  { hosts: ["peninsula.com"], program: "peninsula_pia" },
  { hosts: ["langhamhotels.com"], program: "langham_1865" },
  { hosts: ["melia.com"], program: "melia_rewards" },
  { hosts: ["nh-hotels.com"], program: "nh_rewards" },
  { hosts: ["barcelo.com"], program: "barcelo_mybarcelo" },
  { hosts: ["louvrehotels.com"], program: "louvre_rewards" },
  { hosts: ["omnihotels.com"], program: "omni_select" },
  { hosts: ["slh.com"], program: "slh_invited" },
  { hosts: ["preferredhotels.com"], program: "preferred_iprefer" },

  /* ---------------- Travel / OTA ---------------- */
  { hosts: ["makemytrip.com"], program: "makemytrip_tier" },
  { hosts: ["cleartrip.com"], program: "cleartrip_elite" },
  { hosts: ["goibibo.com"], program: "goibibo_plus" },

  /* ---------------- Indian banks & cards ---------------- */
  { hosts: ["hdfcbank.com", "netbanking.hdfcbank.com", "smartbuy.hdfcbank.com"], program: "hdfc_rewards" },
  { hosts: ["axisbank.com", "edgerewards.axisbank.co.in"], program: "axis_edge" },
  { hosts: ["traveledge.axisbank.co.in"], program: "axis_edge_miles" },
  { hosts: ["icicibank.com"], program: "icici_rewards" },
  { hosts: ["payback.in"], program: "icici_payback" },
  { hosts: ["sbicard.com"], program: "sbi_rewards" },
  { hosts: ["americanexpress.com"], program: "amex_mr" },
  { hosts: ["indusind.com"], program: "indusind_rewards" },
  { hosts: ["kotak.com"], program: "kotak_rewards" },
  { hosts: ["yesbank.in"], program: "yes_rewardz" },
  { hosts: ["idfcfirstbank.com"], program: "idfc_rewards" },
  { hosts: ["federalbank.co.in"], program: "federal_rewards" },
  { hosts: ["aubank.in"], program: "au_rewards" },
  { hosts: ["rblbank.com"], program: "rbl_rewards" },
  { hosts: ["hsbc.co.in"], program: "hsbc_rewards" },
  { hosts: ["sc.com"], program: "sc_360" },
  { hosts: ["bankofbaroda.in", "bobfinancial.com"], program: "bob_rewards" },
  { hosts: ["citibank.co.in"], program: "citi_rewards_in" },
  { hosts: ["dbs.com", "digibank.dbs.com"], program: "dbs_rewards" },
  { hosts: ["pnbindia.in"], program: "pnb_rewards" },
  { hosts: ["canarabank.com"], program: "canara_rewards" },
  { hosts: ["unionbankofindia.co.in"], program: "union_rewards" },
  { hosts: ["idbibank.in"], program: "idbi_rewards" },
  { hosts: ["kvb.co.in"], program: "kvb_rewards" },
  { hosts: ["southindianbank.com"], program: "sib_rewards" },
  { hosts: ["bajajfinserv.in"], program: "bajaj_rewards" },
  { hosts: ["getonecard.app", "onecard.app"], program: "onecard_rewards" },
  { hosts: ["sliceit.com"], program: "slice_sparks" },
  { hosts: ["uni.cards"], program: "uni_rewards" },

  /* ---------------- US / global banks ---------------- */
  { hosts: ["chase.com"], program: "chase_ur" },
  { hosts: ["citi.com", "thankyou.com"], program: "citi_thankyou" },
  { hosts: ["capitalone.com"], program: "capitalone_miles" },
  { hosts: ["bankofamerica.com"], program: "bofa_rewards" },
  { hosts: ["wellsfargo.com"], program: "wellsfargo_rewards" },
  { hosts: ["discover.com"], program: "discover_cashback" },
  { hosts: ["usbank.com"], program: "usbank_rewards" },
  { hosts: ["barclaycardus.com"], program: "barclays_rewards" },
  { hosts: ["synchronybank.com"], program: "synchrony_rewards" },

  /* ---------------- Fintech ---------------- */
  { hosts: ["jupiter.money"], program: "jupiter_jewels" },
  { hosts: ["fi.money"], program: "fi_coins" },
  { hosts: ["paytm.com"], program: "paytm_points" },
  { hosts: ["phonepe.com"], program: "phonepe_rewards" },
  { hosts: ["cred.club"], program: "cred_coins" },

  /* ---------------- Shopping ---------------- */
  { hosts: ["amazon.in", "amazon.com"], program: "amazon_prime" },
  { hosts: ["flipkart.com"], program: "flipkart_plus" },
  { hosts: ["myntra.com"], program: "myntra_insider" },
  { hosts: ["nykaa.com"], program: "nykaa_beauty" },
  { hosts: ["tatneu.com", "tataneu.com"], program: "tata_neu" },

  /* ---------------- Dining ---------------- */
  { hosts: ["zomato.com"], program: "zomato_gold" },
  { hosts: ["swiggy.com"], program: "swiggy_super" },
  { hosts: ["dineout.co.in"], program: "dineout_goldmember" },
  { hosts: ["eazydiner.com"], program: "eazydiner_premium" },

  /* ---------------- Fuel ---------------- */
  { hosts: ["bharatpetroleum.in", "bharatpetroleum.com"], program: "bpcl_speedpay" },
  { hosts: ["hindustanpetroleum.com"], program: "hpcl_payback" },
  { hosts: ["indianoil.in"], program: "ioc_speedy" },
  { hosts: ["shell.in", "shell.com"], program: "shell_rewards" },

  /* ---------------- Telecom & entertainment ---------------- */
  { hosts: ["airtel.in"], program: "airtel_thanks" },
  { hosts: ["jio.com"], program: "jio_rewards" },
  { hosts: ["myvi.in"], program: "vi_rewards" },
  { hosts: ["bookmyshow.com"], program: "bookmyshow" },
  { hosts: ["netflix.com"], program: "netflix_premium" },
  { hosts: ["hotstar.com"], program: "hotstar_premium" },
];

/**
 * Resolve a hostname to a program_code, or null.
 *
 * Matches the registrable domain and any subdomain, so one entry covers
 * "marriott.com", "www.marriott.com" and "members.marriott.com". The
 * endsWith check is anchored on a leading dot so "notmarriott.com" cannot
 * match "marriott.com".
 *
 * Where two entries could match, the longest host wins — that way a
 * specific account subdomain listed for one program is not shadowed by a
 * shorter parent domain belonging to another.
 */
self.qnResolveProgram = function qnResolveProgram(hostname) {
  if (!hostname) return null;
  const host = String(hostname).toLowerCase().replace(/^www\./, "");

  let best = null;
  let bestLen = -1;
  for (const entry of self.QN_PROGRAM_HOSTS) {
    for (const h of entry.hosts) {
      if ((host === h || host.endsWith("." + h)) && h.length > bestLen) {
        best = entry.program;
        bestLen = h.length;
      }
    }
  }
  return best;
};
