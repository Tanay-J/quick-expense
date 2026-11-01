/**
 * Smart Zero-Cost Local Natural Language Expense & Income Parser
 * Parses messages like:
 * - "200 fuel bike"
 * - "450 dinner with friends yesterday"
 * - "+50000 salary oct" or "salary 85k"
 * - "received 450 cashback, 200 fuel bike"
 * - "1.5k shoes amazon"
 * - "150 coffee, 80 auto, 1200 groceries"
 * - "rent 15000 1st oct"
 */

export const EXPENSE_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', icon: '🍔', hue: '24', type: 'expense' },
  { id: 'groceries', name: 'Groceries', icon: '🛒', hue: '142', type: 'expense' },
  { id: 'transport', name: 'Transport & Fuel', icon: '⛽', hue: '210', type: 'expense' },
  { id: 'bills', name: 'Bills & Utilities', icon: '💡', hue: '45', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', hue: '280', type: 'expense' },
  { id: 'health', name: 'Health & Fitness', icon: '💊', hue: '340', type: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', hue: '190', type: 'expense' },
  { id: 'personal', name: 'Personal & Home', icon: '🏠', hue: '165', type: 'expense' },
  { id: 'other', name: 'Other Expense', icon: '📌', hue: '220', type: 'expense' }
];

export const INCOME_CATEGORIES = [
  { id: 'salary', name: 'Salary & Paycheck', icon: '💰', hue: '152', type: 'income' },
  { id: 'freelance', name: 'Freelance & Business', icon: '💼', hue: '172', type: 'income' },
  { id: 'investments', name: 'Investments & Returns', icon: '📈', hue: '135', type: 'income' },
  { id: 'refunds', name: 'Refunds & Cashback', icon: '🔄', hue: '195', type: 'income' },
  { id: 'gifts_in', name: 'Gifts & Splitwise', icon: '🎁', hue: '310', type: 'income' },
  { id: 'other_income', name: 'Other Income', icon: '💵', hue: '160', type: 'income' }
];

export const CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export const PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', shortName: 'UPI', icon: '⚡', hue: '198' },
  { id: 'credit_card', name: 'Credit Card', shortName: 'Credit Card', icon: '💳', hue: '268' },
  { id: 'cash', name: 'Cash', shortName: 'Cash', icon: '💵', hue: '145' },
  { id: 'cashback_wallet', name: 'Cashback / Wallet', shortName: 'Cashback', icon: '🎁', hue: '325' },
  { id: 'debit_card', name: 'Debit Card', shortName: 'Debit Card', icon: '🏧', hue: '36' },
  { id: 'bank', name: 'Bank Transfer', shortName: 'Bank', icon: '🏦', hue: '215' }
];

export function getPaymentMethodById(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) || PAYMENT_METHODS[0];
}

export function isIncomeCategory(categoryId) {
  return INCOME_CATEGORIES.some((c) => c.id === categoryId);
}

export function getCategoriesByType(type = 'expense') {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export const DEFAULT_INCOME_KEYWORDS = {
  salary: [
    'salary', 'paycheck', 'stipend', 'wages', 'bonus', 'appraisal', 'payout', 'pension'
  ],
  freelance: [
    'freelance', 'consulting', 'client', 'project payment', 'invoice', 'commission', 'side hustle', 'gig'
  ],
  investments: [
    'dividend', 'dividends', 'interest', 'stocks', 'mutual fund', 'fd', 'profit', 'returns', 'capital gain', 'rental income'
  ],
  refunds: [
    'refund', 'refunded', 'cashback', 'reimbursement', 'reimbursed', 'reversal', 'claim', 'return'
  ],
  gifts_in: [
    'splitwise', 'settled', 'pocket money', 'allowance', 'shagun', 'gift money', 'paid back', 'returned by'
  ]
};

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
    'for', 'with', 'and', 'the', 'from', 'paid', 'spent', 'received', 'got', 'credited',
    'income', 'to', 'in', 'on', 'at', 'by', 'my', 'rs', 'inr'
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
  return CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
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
 * Detect whether a segment explicitly signals 'income' or 'expense'
 */
export function detectExplicitType(segment, defaultType = 'expense') {
  if (!segment) return defaultType;
  const trimmed = segment.trim();

  // Unary '+' before an amount or at start of message -> income (not binary '120+80')
  if (/^\+/.test(trimmed) || /(?:^|\s)\+\s*(?:₹|rs\.?|inr\s*)?\d/i.test(trimmed)) {
    return 'income';
  }

  // Unary '-' before an amount or at start -> expense
  if (/^-/.test(trimmed) || /(?:^|\s)-\s*(?:₹|rs\.?|inr\s*)?\d/i.test(trimmed)) {
    return 'expense';
  }

  // Explicit income verbs / phrases
  if (/\b(received|credited|earned|income|got\s+paid|paid\s+back)\b/i.test(trimmed)) {
    return 'income';
  }

  // Explicit expense verbs
  if (/\b(spent|debited)\b/i.test(trimmed)) {
    return 'expense';
  }

  return null;
}

function matchDictionaryExact(lower, words, dict) {
  for (const [catId, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) return catId;
      } else if (words.includes(kw)) {
        return catId;
      }
    }
  }
  return null;
}

function matchDictionaryPrefix(words, dict) {
  for (const [catId, keywords] of Object.entries(dict)) {
    for (const kw of keywords) {
      if (!kw.includes(' ') && kw.length >= 4 && words.some((w) => w.length >= 3 && (kw.startsWith(w) || w.startsWith(kw)))) {
        return catId;
      }
    }
  }
  return null;
}

/**
 * Infer category from text using learned keywords first, then default dictionary.
 * If forcedType ('expense' | 'income') is provided, restricts category to that type.
 */
export function inferCategory(text, forcedType = null) {
  const lower = (text || '').toLowerCase().trim();
  const fallback = forcedType === 'income' ? 'other_income' : 'other';
  if (!lower) return fallback;

  const learned = getLearnedKeywords();
  const words = lower.replace(/[^\p{L}\p{N}\s&]/gu, ' ').split(/\s+/).filter(Boolean);

  // 1. Check learned user keywords first (exact token match)
  for (const w of words) {
    const learnedCat = learned[w];
    if (learnedCat) {
      if (!forcedType) return learnedCat;
      const isInc = isIncomeCategory(learnedCat);
      if ((forcedType === 'income' && isInc) || (forcedType === 'expense' && !isInc)) {
        return learnedCat;
      }
    }
  }

  // 2. If forcedType is 'income', search income dictionary only
  if (forcedType === 'income') {
    return (
      matchDictionaryExact(lower, words, DEFAULT_INCOME_KEYWORDS) ||
      matchDictionaryPrefix(words, DEFAULT_INCOME_KEYWORDS) ||
      'other_income'
    );
  }

  // 3. If forcedType is 'expense', search expense dictionary only
  if (forcedType === 'expense') {
    return (
      matchDictionaryExact(lower, words, DEFAULT_KEYWORDS) ||
      matchDictionaryPrefix(words, DEFAULT_KEYWORDS) ||
      'other'
    );
  }

  // 4. Auto-detect exact matches first: unambiguous income keywords, then expense keywords
  const exactIncome = matchDictionaryExact(lower, words, DEFAULT_INCOME_KEYWORDS);
  if (exactIncome) return exactIncome;

  const exactExpense = matchDictionaryExact(lower, words, DEFAULT_KEYWORDS);
  if (exactExpense) return exactExpense;

  // 5. Fallback to single-word prefix matches
  const prefixExpense = matchDictionaryPrefix(words, DEFAULT_KEYWORDS);
  if (prefixExpense) return prefixExpense;

  const prefixIncome = matchDictionaryPrefix(words, DEFAULT_INCOME_KEYWORDS);
  if (prefixIncome) return prefixIncome;

  return 'other';
}

/**
 * Extract payment method (UPI, Credit Card, Cash, Cashback/Wallet, Debit Card, Bank)
 * and return { paymentMethod, explicitPayment, forcesExpense, cleanedText }
 */
export function extractPaymentMethod(text, defaultPayment = 'upi') {
  let working = text || '';

  // 1. Explicit "from/via/using cashback" or wallet phrases -> expense paid using Cashback/Wallet
  const cashbackPayRegex = /\b(?:(?:from|via|by|using|with|through|thru)\s+(?:cashback|cb|wallet|amazon\s+pay|apay|paytm\s+wallet|reward\s*points?|points|voucher|gift\s*card|pluxee|sodexo)|(?:cashback\s+wallet|cb\s+wallet|amazon\s+pay\s+balance|apay\s+balance|paytm\s+wallet|mobikwik|freecharge|pluxee|sodexo|reward\s+points?))\b/i;
  if (cashbackPayRegex.test(working)) {
    working = working.replace(cashbackPayRegex, ' ');
    return {
      paymentMethod: 'cashback_wallet',
      explicitPayment: true,
      forcesExpense: true,
      cleanedText: working
    };
  }

  // 2. Standalone "wallet" token -> Cashback / Wallet
  const walletRegex = /\b(?:(?:via|by|on|from|using|with|in)\s+)?wallet\b/i;
  if (walletRegex.test(working)) {
    working = working.replace(walletRegex, ' ');
    return {
      paymentMethod: 'cashback_wallet',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 3. Credit Card (cc, credit card, amex, infinia, regalia, etc.)
  const ccRegex = /\b(?:(?:via|by|on|from|using|with)\s+)?(?:credit\s+card|cc|amex|infinia|regalia|millennia|icici\s+cc|hdfc\s+cc|sbi\s+cc|axis\s+cc)\b/i;
  if (ccRegex.test(working)) {
    working = working.replace(ccRegex, ' ');
    return {
      paymentMethod: 'credit_card',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 4. Debit Card (dc, debit card, atm card)
  const dcRegex = /\b(?:(?:via|by|on|from|using|with)\s+)?(?:debit\s+card|dc|atm\s+card)\b/i;
  if (dcRegex.test(working)) {
    working = working.replace(dcRegex, ' ');
    return {
      paymentMethod: 'debit_card',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 5. Cash
  const cashRegex = /\b(?:(?:via|by|in|from|using|with)\s+)?cash\b/i;
  if (cashRegex.test(working)) {
    working = working.replace(cashRegex, ' ');
    return {
      paymentMethod: 'cash',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 6. Bank Transfer (neft, imps, rtgs, netbanking, bank transfer, cheque)
  const bankRegex = /\b(?:(?:via|by|from|using|with)\s+)?(?:netbanking|net\s+banking|bank\s+transfer|neft|imps|rtgs|cheque|auto\s*debit|nach)\b/i;
  if (bankRegex.test(working)) {
    working = working.replace(bankRegex, ' ');
    return {
      paymentMethod: 'bank',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 7. UPI (upi, gpay, google pay, phonepe, paytm, bhim, cred upi, supermoney, famapp)
  const upiRegex = /\b(?:(?:via|by|on|from|using|with)\s+)?(?:upi|gpay|google\s+pay|phonepe|paytm|bhim|cred\s+upi|supermoney|famapp)\b/i;
  if (upiRegex.test(working)) {
    working = working.replace(upiRegex, ' ');
    return {
      paymentMethod: 'upi',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  return {
    paymentMethod: defaultPayment || 'upi',
    explicitPayment: false,
    forcesExpense: false,
    cleanedText: working
  };
}

export function extractRecurring(text) {
  const recRegex = /\b(every\s+month|monthly|recurring|autopay|auto-pay)\b/i;
  const subRegex = /\b(subscription|netflix|spotify|icloud|google\s+one|youtube\s+premium|prime\s+video|chatgpt)\b/i;
  const hasExplicitRec = recRegex.test(text);
  const hasImplicitSub = subRegex.test(text);
  if (!hasExplicitRec && !hasImplicitSub) {
    return { recurring: false, cleanedText: text };
  }
  const cleanedText = text.replace(recRegex, ' ').replace(/\s+/g, ' ').trim();
  return { recurring: true, cleanedText };
}

/**
 * Parse a single expense or income segment like:
 * - "200 fuel bike"
 * - "1500 shoes myntra cc"
 * - "250 coffee from cashback"
 * - "+50000 salary"
 * - "received 450 cashback yesterday"
 */
export function parseSingleExpense(segment, now = new Date(), defaultType = 'expense', defaultPayment = 'upi') {
  if (!segment || !segment.trim()) return null;

  const explicitType = detectExplicitType(segment, defaultType);

  // Extract recurring monthly keywords ("monthly", "every month", "recurring", "autopay")
  const { recurring, cleanedText: recCleanedText } = extractRecurring(segment);

  // Extract date first so numbers in dates ("2 days ago", "15 oct") aren't confused with amounts
  const { dateStr, cleanedText: dateCleanedText, dateLabel } = extractDate(recCleanedText, now);

  // Extract payment method before category inference so "from cashback" or "cc" are stripped cleanly
  const {
    paymentMethod: extractedPayment,
    explicitPayment,
    forcesExpense,
    cleanedText: paymentCleanedText
  } = extractPaymentMethod(dateCleanedText, defaultPayment);

  // Evaluate simple inline addition expressions like "120+80 lunch" or "100 + 50 snacks"
  const mathCleanedText = paymentCleanedText.replace(
    /\b(\d+(?:\.\d{1,2})?(?:\s*\+\s*\d+(?:\.\d{1,2})?)+)\b/g,
    (expr) => {
      const sum = expr
        .split('+')
        .map((n) => parseFloat(n.trim()))
        .reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
      return String(Math.round(sum * 100) / 100);
    }
  );

  // Strip leading unary + or - before currency/digits so amountRegex matches cleanly
  const cleanedText = mathCleanedText.replace(/(^|\s)[+-]\s*(?=(?:₹|rs\.?|inr\s*)?\d)/gi, '$1');

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
    .replace(/^[+-]\s*/, '')
    .replace(/\b(spent|paid|received|credited|earned|got|for|on|from|via|by|using|with|rs\.?|inr|rupees)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const effectiveExplicitType = forcesExpense && explicitType !== 'income' ? 'expense' : explicitType;
  const forcedType = effectiveExplicitType || (defaultType === 'income' ? 'income' : null);
  const categoryId = inferCategory(note || paymentCleanedText, forcedType);
  const resolvedType = isIncomeCategory(categoryId)
    ? 'income'
    : (effectiveExplicitType || defaultType || 'expense');
  const finalCategoryId =
    resolvedType === 'income' && !isIncomeCategory(categoryId)
      ? inferCategory(note || paymentCleanedText, 'income')
      : categoryId;
  const categoryObj = getCategoryById(finalCategoryId);

  // Default income payment mode to 'bank' if salary/investments and no explicit payment was specified
  const finalPaymentMethod =
    !explicitPayment && resolvedType === 'income' && (finalCategoryId === 'salary' || finalCategoryId === 'investments')
      ? 'bank'
      : extractedPayment;

  if (!note) {
    note = categoryObj.name;
  } else {
    note = note.charAt(0).toUpperCase() + note.slice(1);
  }

  return {
    type: resolvedType,
    amount,
    note,
    category: finalCategoryId,
    paymentMethod: finalPaymentMethod,
    recurring,
    date: dateStr,
    dateLabel,
    raw: segment.trim()
  };
}

/**
 * Parse a full user message that may contain 1 or multiple expenses/incomes
 * e.g. "200 fuel bike, 150 coffee" or "+50000 salary, 200 fuel"
 */
export function parseExpenseMessage(input, now = new Date(), defaultType = 'expense', defaultPayment = 'upi') {
  if (!input || !input.trim()) return [];

  // Split by newlines or commas ONLY when comma is NOT inside a number like 1,200
  const segments = input
    .split(/\n+|,(?!\d{2,3}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = [];
  for (const seg of segments) {
    const item = parseSingleExpense(seg, now, defaultType, defaultPayment);
    if (item) {
      parsed.push(item);
    }
  }
  return parsed;
}

/**
 * Parse a message into interactive draft items for the live "Going to be saved" preview.
 * Even if an amount hasn't been typed yet (e.g. "dinner yesterday" or "salary"), returns the inferred
 * type, category, paymentMethod, cleaned note, and resolved date so the user can see & edit all fields inline.
 */
export function parseDraftMessage(input, now = new Date(), defaultType = 'expense', defaultPayment = 'upi') {
  if (!input || !input.trim()) return [];

  const segments = input
    .split(/\n+|,(?!\d{2,3}\b)/)
    .map((s) => s.trim())
    .filter(Boolean);

  const drafts = [];
  for (const seg of segments) {
    const full = parseSingleExpense(seg, now, defaultType, defaultPayment);
    if (full) {
      drafts.push({ ...full, missingAmount: false });
      continue;
    }

    const explicitType = detectExplicitType(seg, defaultType);
    const { recurring, cleanedText: recCleanedText } = extractRecurring(seg);
    const { dateStr, cleanedText: dateCleanedText, dateLabel } = extractDate(recCleanedText, now);
    const {
      paymentMethod: extractedPayment,
      explicitPayment,
      forcesExpense,
      cleanedText: paymentCleanedText
    } = extractPaymentMethod(dateCleanedText, defaultPayment);

    let note = paymentCleanedText
      .replace(/^[+-]\s*/, '')
      .replace(/\b(spent|paid|received|credited|earned|got|for|on|from|via|by|using|with|rs\.?|inr|rupees)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const effectiveExplicitType = forcesExpense && explicitType !== 'income' ? 'expense' : explicitType;
    const forcedType = effectiveExplicitType || (defaultType === 'income' ? 'income' : null);
    const categoryId = inferCategory(note || paymentCleanedText, forcedType);
    const resolvedType = isIncomeCategory(categoryId)
      ? 'income'
      : (effectiveExplicitType || defaultType || 'expense');
    const finalCategoryId =
      resolvedType === 'income' && !isIncomeCategory(categoryId)
        ? inferCategory(note || paymentCleanedText, 'income')
        : categoryId;
    const categoryObj = getCategoryById(finalCategoryId);

    const finalPaymentMethod =
      !explicitPayment && resolvedType === 'income' && (finalCategoryId === 'salary' || finalCategoryId === 'investments')
        ? 'bank'
        : extractedPayment;

    if (!note) {
      note = categoryObj.name;
    } else {
      note = note.charAt(0).toUpperCase() + note.slice(1);
    }

    drafts.push({
      type: resolvedType,
      amount: null,
      note,
      category: finalCategoryId,
      paymentMethod: finalPaymentMethod,
      recurring,
      date: dateStr,
      dateLabel,
      raw: seg,
      missingAmount: true
    });
  }

  return drafts;
}
