export interface AirlineEntry {
  code: string;
  name: string;
  aliases: string[];
}

const AIRLINE_CATALOG: AirlineEntry[] = [
  { code: 'IX', name: 'Air India Express', aliases: ['air india express', 'airindiaexpress', 'ix'] },
  { code: 'AI', name: 'Air India', aliases: ['air india', 'airindia', 'ai'] },
  { code: '6E', name: 'IndiGo', aliases: ['indigo', '6e'] },
  { code: 'SG', name: 'SpiceJet', aliases: ['spicejet', 'sg'] },
  { code: 'UK', name: 'Vistara', aliases: ['vistara', 'uk'] },
  { code: 'QP', name: 'Akasa Air', aliases: ['akasa air', 'akasa', 'qp'] },
  { code: 'S5', name: 'Star Air', aliases: ['star air', 's5'] },
  { code: '9I', name: 'Alliance Air', aliases: ['alliance air', '9i'] },
  { code: 'IC', name: 'Fly91', aliases: ['fly91', 'ic'] },
  { code: 'FL', name: 'FlyBig', aliases: ['flybig', 's9'] },
  { code: '8D', name: 'FitsAir', aliases: ['fitsair', 'fits air', '8d'] },
  { code: 'UL', name: 'SriLankan Airlines', aliases: ['srilankan', 'srilankan airlines', 'ul'] },
  { code: 'EK', name: 'Emirates', aliases: ['emirates', 'ek'] },
  { code: 'QR', name: 'Qatar Airways', aliases: ['qatar airways', 'qatar', 'qr'] },
  { code: 'EY', name: 'Etihad Airways', aliases: ['etihad airways', 'etihad', 'ey'] },
  { code: 'G9', name: 'Air Arabia', aliases: ['air arabia', 'g9'] },
  { code: 'FZ', name: 'flydubai', aliases: ['flydubai', 'fly dubai', 'fz'] },
  { code: 'WY', name: 'Oman Air', aliases: ['oman air', 'wy'] },
  { code: 'GF', name: 'Gulf Air', aliases: ['gulf air', 'gf'] },
  { code: 'KU', name: 'Kuwait Airways', aliases: ['kuwait airways', 'ku'] },
  { code: 'SV', name: 'Saudia', aliases: ['saudia', 'saudi arabian airlines', 'sv'] },
  { code: 'XY', name: 'flynas', aliases: ['flynas', 'xy'] },
  { code: 'SQ', name: 'Singapore Airlines', aliases: ['singapore airlines', 'singapore', 'sq'] },
  { code: 'TR', name: 'Scoot', aliases: ['scoot', 'tr'] },
  { code: 'MH', name: 'Malaysia Airlines', aliases: ['malaysia airlines', 'mh'] },
  { code: 'AK', name: 'AirAsia', aliases: ['airasia', 'air asia', 'ak', 'i5', 'fd', 'd7', 'qz'] },
  { code: 'TG', name: 'Thai Airways', aliases: ['thai airways', 'tg'] },
  { code: 'VJ', name: 'VietJet Air', aliases: ['vietjet', 'vietjet air', 'vj'] },
  { code: 'VN', name: 'Vietnam Airlines', aliases: ['vietnam airlines', 'vn'] },
  { code: 'CX', name: 'Cathay Pacific', aliases: ['cathay pacific', 'cx'] },
  { code: 'TK', name: 'Turkish Airlines', aliases: ['turkish airlines', 'tk'] },
  { code: 'LH', name: 'Lufthansa', aliases: ['lufthansa', 'lh'] },
  { code: 'BA', name: 'British Airways', aliases: ['british airways', 'ba'] },
  { code: 'AF', name: 'Air France', aliases: ['air france', 'af'] },
  { code: 'KL', name: 'KLM', aliases: ['klm', 'kl'] },
  { code: 'LX', name: 'SWISS', aliases: ['swiss', 'lx'] },
  { code: 'UA', name: 'United Airlines', aliases: ['united airlines', 'ua'] },
  { code: 'DL', name: 'Delta Air Lines', aliases: ['delta', 'delta air lines', 'dl'] },
  { code: 'AA', name: 'American Airlines', aliases: ['american airlines', 'aa'] },
];

const findAirlineEntry = (raw?: string): AirlineEntry | undefined => {
  if (!raw) return undefined;
  const n = raw.trim().toLowerCase();
  if (!n) return undefined;

  // Exact match on alias or code first
  const exact = AIRLINE_CATALOG.find(
    (entry) => entry.code.toLowerCase() === n || entry.aliases.includes(n)
  );
  if (exact) return exact;

  // Substring match for multi-word airline names (skip 2-char codes to avoid false positives)
  return AIRLINE_CATALOG.find((entry) =>
    entry.aliases.some((alias) => alias.length > 2 && n.includes(alias))
  );
};

/**
 * Normalizes airline code or name into canonical brand casing.
 */
export const formatAirlineName = (name?: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  const entry = findAirlineEntry(trimmed);
  if (entry) return entry.name;
  return trimmed.replace(/\b[a-z]/g, (char) => char.toUpperCase());
};

/**
 * Resolves a 2-character IATA airline code for logo lookups and feed matching.
 */
export const getAirlineCode = (name?: string): string => {
  if (!name) return 'AI';
  const trimmed = name.trim();
  const entry = findAirlineEntry(trimmed);
  if (entry) return entry.code;

  // If caller already passed a 2-character IATA code (e.g. "8D", "XY"), preserve it
  if (/^[A-Za-z0-9]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return 'AI';
};

/**
 * Returns a high-resolution 400x160 landscape IATA airline logo URL.
 */
export const getAirlineLogoUrl = (nameOrCode?: string): string => {
  return `https://pics.avs.io/400/160/${getAirlineCode(nameOrCode)}.png`;
};
