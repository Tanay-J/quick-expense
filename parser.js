/**
 * Smart Zero-Cost Local Natural Language Expense Parser
 * Parses messages like:
 * - "200 fuel bike"
 * - "450 dinner with friends yesterday"
 * - "1.5k shoes amazon"
 * - "150 coffee, 80 auto, 1200 groceries"
 * - "rent 15000 1st oct"
 */

export const CATEGORIES = [
  { id: 'food', name: 'Food & Dining', icon: '🍽️', hue: '24' },
  { id: 'groceries', name: 'Groceries', icon: '🛒', hue: '142' },
  { id: 'transport', name: 'Transport & Fuel', icon: '⛽', hue: '210' },
  { id: 'bills', name: 'Bills & Utilities', icon: '⚡', hue: '45' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', hue: '280' },
  { id: 'health', name: 'Health & Fitness', icon: '💊', hue: '340' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', hue: '190' },
  { id: 'personal', name: 'Personal & Home', icon: '🏠', hue: '165' },
  { id: 'other', name: 'Other', icon: '📌', hue: '220' }
];

export const DEFAULT_KEYWORDS = {
  transport: [
    'fuel', 'petrol', 'diesel', 'cng', 'bike', 'car', 'scooter', 'scooty',
    'auto', 'rickshaw', 'uber', 'ola', 'rapido', 'cab', 'taxi', 'metro',
    'bus', 'train', 'irctc', 'flight', 'indigo', 'toll', 'fastag', 'parking',
    'tyre', 'air', 'service', 'mechanic', 'oil', 'shell', 'hp', 'indian oil', 'bharat petroleum'
  ],
  food: [
    'food', 'dinner', 'lunch', 'breakfast', 'brunch', 'snacks', 'snack',
    'coffee', 'chai', 'tea', 'cafe', 'restaurant', 'swiggy', 'zomato',
    'pizza', 'burger', 'biryani', 'momos', 'dosa', 'idli', 'thali', 'samosa',
    'bakery', 'cake', 'icecream', 'dessert', 'drinks', 'beer', 'pub', 'bar',
    'starbucks', 'mcdonalds', 'kfc', 'dominos', 'subway', 'canteen', 'mess', 'tiffin'
  ],
  groceries: [
    'grocery', 'groceries', 'milk', 'bread', 'eggs', 'vegetables', 'veggies',
    'fruits', 'fruit', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'dmart',
    'reliance', 'supermarket', 'kirana', 'ration', 'curd', 'paneer', 'chicken',
    'fish', 'meat', 'rice', 'atta', 'oil', 'spices', 'water can', 'bisleri'
  ],
  bills: [
    'rent', 'electricity', 'power', 'water', 'gas', 'cylinder', 'wifi',
    'broadband', 'internet', 'jio', 'airtel', 'vi', 'bsnl', 'recharge',
    'mobile', 'postpaid', 'prepaid', 'maintenance', 'society', 'maid', 'cook',
    'emi', 'loan', 'insurance', 'tax', 'icloud', 'google one'
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'zara', 'h&m',
    'uniqlo', 'decathlon', 'shoes', 'shirt', 'tshirt', 'jeans', 'clothes',
    'dress', 'watch', 'bag', 'backpack', 'electronics', 'charger', 'cable',
    'earphones', 'gift', 'present', 'ikea', 'furniture'
  ],
  health: [
    'medicine', 'meds', 'pharmacy', 'apollo', 'pharmeasy', '1mg', 'doctor',
    'hospital', 'clinic', 'dentist', 'test', 'lab', 'blood', 'gym', 'fitness',
    'protein', 'whey', 'creatine', 'vitamins', 'supplements', 'yoga', 'cult',
    'spectacles', 'lenskart', 'eyewear'
  ],
  entertainment: [
    'movie', 'movies', 'cinema', 'pvr', 'inox', 'bookmyshow', 'netflix',
    'prime', 'hotstar', 'spotify', 'youtube', 'apple music', 'game', 'steam',
    'ps5', 'bowling', 'concert', 'show', 'match', 'turf', 'badminton', 'cricket',
    'subscription', 'book', 'books', 'kindle'
  ],
  personal: [
    'haircut', 'salon', 'barber', 'spa', 'grooming', 'laundry', 'dryclean',
    'ironing', 'tailor', 'repair', 'plumber', 'electrician', 'carpenter',
    'cleaning', 'urban company', 'stationery', 'print', 'xerox', 'courier'
  ]
};

const LEARNED_KEYWORDS_KEY = 'qe_learned_keywords_v1';

export function getLearnedKeywords() {
  try {
    const raw = localStorage.getItem(LEARNED_KEYWORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function mergeLearnedKeywords(incoming = {}) {
  if (!incoming || typeof incoming !== 'object') return;
  const current = getLearnedKeywords();
  const merged = { ...current, ...incoming };
  try {
    localStorage.setItem(LEARNED_KEYWORDS_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage errors
  }
}

export function saveLearnedKeyword(word, categoryId) {
  if (!word || !categoryId) return;
  const clean = word.toLowerCase().trim();
  if (clean.length < 2 || /^\d+$/.test(clean)) return;
  const stopWords = new Set([
    'for', 'with', 'and', 'the', 'from', 'paid', 'spent', 'to', 'in', 'on', 'at', 'by', 'my', 'rs', 'inr'
  ]);
  if (stopWords.has(clean)) return;

  const learned = getLearnedKeywords();
  learned[clean] = categoryId;
  try {
    localStorage.setItem(LEARNED_KEYWORDS_KEY, JSON.stringify(learned));
  } catch {
    // ignore storage errors
  }
}

export function learnFromNote(note, categoryId) {
  if (!note || !categoryId) return;
  const tokens = note
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    saveLearnedKeyword(token, categoryId);
  }
}

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Format Date to YYYY-MM-DD in local time
 */
export function toLocalISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract relative or explicit date from text and return { dateStr, cleanedText, dateLabel }
 */
function extractDate(text, now = new Date()) {
  let working = text;
  let targetDate = new Date(now);
  let matchedLabel = 'Today';

  // 1. "day before yesterday" / "parso"
  const dbyRegex = /\b(day\s+before\s+yesterday|parso)\b/i;
  if (dbyRegex.test(working)) {
    targetDate.setDate(targetDate.getDate() - 2);
    working = working.replace(dbyRegex, ' ');
    matchedLabel = '2 days ago';
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
  }

  // 2. "yesterday" / "kal" / "last night"
  const yestRegex = /\b(yesterday|last\s+night|kal)\b/i;
  if (yestRegex.test(working)) {
    targetDate.setDate(targetDate.getDate() - 1);
    working = working.replace(yestRegex, ' ');
    matchedLabel = 'Yesterday';
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
  }

  // 3. "today" / "aaj" / "this morning" / "tonight"
  const todayRegex = /\b(today|aaj|this\s+morning|tonight)\b/i;
  if (todayRegex.test(working)) {
    working = working.replace(todayRegex, ' ');
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: 'Today' };
  }

  // 4. "N days ago"
  const daysAgoRegex = /\b(\d{1,2})\s+days?\s+ago\b/i;
  const daysAgoMatch = working.match(daysAgoRegex);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    targetDate.setDate(targetDate.getDate() - days);
    working = working.replace(daysAgoRegex, ' ');
    matchedLabel = `${days}d ago`;
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
  }

  // 5. "last monday..sunday"
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lastDayRegex = /\b(?:last|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/i;
  const lastDayMatch = working.match(lastDayRegex);
  if (lastDayMatch) {
    const token = lastDayMatch[1].toLowerCase().slice(0, 3);
    const targetIdx = weekdays.findIndex((w) => w.startsWith(token));
    if (targetIdx !== -1) {
      const currentIdx = targetDate.getDay();
      let diff = (currentIdx - targetIdx + 7) % 7;
      if (diff === 0) diff = 7;
      targetDate.setDate(targetDate.getDate() - diff);
      working = working.replace(lastDayRegex, ' ');
      matchedLabel = weekdays[targetIdx].slice(0, 3).replace(/^./, (c) => c.toUpperCase());
      return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
    }
  }

  // 6. Explicit date with month name: "15 oct" or "oct 15" or "1st oct"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthPattern = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const monthRegex1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})\\b`, 'i');
  const monthRegex2 = new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');

  const mMatch1 = working.match(monthRegex1);
  const mMatch2 = !mMatch1 ? working.match(monthRegex2) : null;
  if (mMatch1 || mMatch2) {
    const day = parseInt(mMatch1 ? mMatch1[1] : mMatch2[2], 10);
    const monthToken = (mMatch1 ? mMatch1[2] : mMatch2[1]).toLowerCase().slice(0, 3);
    const mIdx = months.indexOf(monthToken);
    if (day >= 1 && day <= 31 && mIdx !== -1) {
      targetDate.setMonth(mIdx, day);
      working = working.replace(mMatch1 ? monthRegex1 : monthRegex2, ' ');
      matchedLabel = `${day} ${months[mIdx].replace(/^./, (c) => c.toUpperCase())}`;
      return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
    }
  }

  return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: 'Today' };
}

/**
 * Infer category from text using learned keywords first, then default dictionary
 */
export function inferCategory(text) {
  const lower = text.toLowerCase().trim();
  if (!lower) return 'other';

  const learned = getLearnedKeywords();
  const words = lower.replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(Boolean);

  // 1. Check learned user keywords first (exact token match)
  for (const w of words) {
    if (learned[w]) {
      return learned[w];
    }
  }

  // 2. Check multi-word phrases and single words in default dictionary
  for (const [catId, keywords] of Object.entries(DEFAULT_KEYWORDS)) {
    for (const kw of keywords) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) return catId;
      } else if (words.includes(kw)) {
        return catId;
      }
    }
  }

  // 3. Partial prefix match (e.g., "grocer", "veg", "med", "petr")
  for (const [catId, keywords] of Object.entries(DEFAULT_KEYWORDS)) {
    for (const kw of keywords) {
      if (kw.length >= 4 && words.some((w) => w.length >= 3 && (kw.startsWith(w) || w.startsWith(kw)))) {
        return catId;
      }
    }
  }

  return 'other';
}

/**
 * Parse a single expense segment like "200 fuel bike" or "coffee 150 yesterday"
 */
export function parseSingleExpense(segment, now = new Date()) {
  if (!segment || !segment.trim()) return null;

  // Extract date first so numbers in dates ("2 days ago", "15 oct") aren't confused with amounts
  const { dateStr, cleanedText: dateCleanedText, dateLabel } = extractDate(segment, now);

  // Evaluate simple inline addition expressions like "120+80 lunch" or "100 + 50 snacks"
  const cleanedText = dateCleanedText.replace(
    /\b(\d+(?:\.\d{1,2})?(?:\s*\+\s*\d+(?:\.\d{1,2})?)+)\b/g,
    (expr) => {
      const sum = expr
        .split('+')
        .map((n) => parseFloat(n.trim()))
        .reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
      return String(Math.round(sum * 100) / 100);
    }
  );

  // Match amount: supports "200", "2,400", "250.50", "1.5k", "₹200", "rs 200", "200/-"
  const amountRegex = /(?:^|\s)(?:₹|rs\.?|inr\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?(?:\s*\/-)?(?=\s|$)/i;
  const match = cleanedText.match(amountRegex);

  if (!match) return null;

  const fullMatch = match[0];
  const intPart = match[1].replace(/,/g, '');
  const decPart = match[2] ? `.${match[2]}` : '';
  const isK = Boolean(match[3]);

  let amount = parseFloat(`${intPart}${decPart}`);
  if (Number.isNaN(amount) || amount <= 0) return null;
  if (isK) amount *= 1000;
  amount = Math.round(amount * 100) / 100;

  // Remove the matched amount token from text to get the item description
  const matchIndex = cleanedText.indexOf(fullMatch);
  const before = cleanedText.slice(0, matchIndex);
  const after = cleanedText.slice(matchIndex + fullMatch.length);
  let note = `${before} ${after}`
    .replace(/\b(spent|paid|for|on|rs\.?|inr|rupees)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of note
  const categoryId = inferCategory(note || segment);
  const categoryObj = getCategoryById(categoryId);

  if (!note) {
    note = categoryObj.name;
  } else {
    note = note.charAt(0).toUpperCase() + note.slice(1);
  }

  return {
    amount,
    note,
    category: categoryId,
    date: dateStr,
    dateLabel,
    raw: segment.trim()
  };
}

/**
 * Parse a full user message that may contain 1 or multiple expenses
 * e.g. "200 fuel bike, 150 coffee" or newline-separated entries
 */
export function parseExpenseMessage(input, now = new Date()) {
  if (!input || !input.trim()) return [];

  // Split by newlines or commas ONLY when comma is NOT inside a number like 1,200
  const segments = input
    .split(/\n+|,(?!\d{2,3}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = [];
  for (const seg of segments) {
    const item = parseSingleExpense(seg, now);
    if (item) {
      parsed.push(item);
    }
  }
  return parsed;
}

/**
 * Parse a message into interactive draft items for the live "Going to be saved" preview.
 * Even if an amount hasn't been typed yet (e.g. "dinner yesterday"), returns the inferred
 * category, cleaned note, and resolved date so the user can see & edit all fields inline.
 */
export function parseDraftMessage(input, now = new Date()) {
  if (!input || !input.trim()) return [];

  const segments = input
    .split(/\n+|,(?!\d{2,3}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const drafts = [];
  for (const seg of segments) {
    const full = parseSingleExpense(seg, now);
    if (full) {
      drafts.push({ ...full, missingAmount: false });
      continue;
    }

    const { dateStr, cleanedText, dateLabel } = extractDate(seg, now);
    let note = cleanedText
      .replace(/\b(spent|paid|for|on|rs\.?|inr|rupees)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const categoryId = inferCategory(note || seg);
    const categoryObj = getCategoryById(categoryId);

    if (!note) {
      note = categoryObj.name;
    } else {
      note = note.charAt(0).toUpperCase() + note.slice(1);
    }

    drafts.push({
      amount: null,
      note,
      category: categoryId,
      date: dateStr,
      dateLabel,
      raw: seg,
      missingAmount: true
    });
  }

  return drafts;
}
