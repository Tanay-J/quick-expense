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

export const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', shortName: 'Food', nameMr: 'जेवण आणि नाश्ता', shortNameMr: 'जेवण', icon: '🍔', hue: '24', color: '#2a78d6', type: 'expense' },
  { id: 'transport', name: 'Transport & Fuel', shortName: 'Transport', nameMr: 'प्रवास आणि इंधन', shortNameMr: 'प्रवास', icon: '⛽', hue: '210', color: '#eb6834', type: 'expense' },
  { id: 'groceries', name: 'Groceries', shortName: 'Groceries', nameMr: 'किराणा आणि भाजी', shortNameMr: 'किराणा', icon: '🛒', hue: '142', color: '#1baf7a', type: 'expense' },
  { id: 'bills', name: 'Bills & Utilities', shortName: 'Bills', nameMr: 'बिले आणि भाडे', shortNameMr: 'बिले', icon: '💡', hue: '45', color: '#eda100', type: 'expense' },
  { id: 'shopping', name: 'Shopping', shortName: 'Shopping', nameMr: 'खरेदी', shortNameMr: 'खरेदी', icon: '🛍️', hue: '280', color: '#e87ba4', type: 'expense' },
  { id: 'health', name: 'Health & Fitness', shortName: 'Health', nameMr: 'आरोग्य आणि औषधे', shortNameMr: 'आरोग्य', icon: '💊', hue: '340', color: '#008300', type: 'expense' },
  { id: 'entertainment', name: 'Entertainment', shortName: 'Fun', nameMr: 'मनोरंजन', shortNameMr: 'मनोरंजन', icon: '🎬', hue: '190', color: '#4a3aa7', type: 'expense' },
  { id: 'personal', name: 'Personal & Home', shortName: 'Personal', nameMr: 'वैयक्तिक आणि घर', shortNameMr: 'वैयक्तिक', icon: '🏠', hue: '165', color: '#0d9488', type: 'expense' },
  { id: 'other', name: 'Other Expense', shortName: 'Other', nameMr: 'इतर खर्च', shortNameMr: 'इतर', icon: '📌', hue: '220', color: '#898781', type: 'expense' }
];

export const DEFAULT_INCOME_CATEGORIES = [
  { id: 'salary', name: 'Salary & Paycheck', shortName: 'Salary', nameMr: 'पगार आणि वेतन', shortNameMr: 'पगार', icon: '💰', hue: '152', color: '#10b981', type: 'income' },
  { id: 'freelance', name: 'Freelance & Business', shortName: 'Freelance', nameMr: 'व्यवसाय आणि काम', shortNameMr: 'व्यवसाय', icon: '💼', hue: '172', color: '#14b8a6', type: 'income' },
  { id: 'investments', name: 'Investments & Returns', shortName: 'Investments', nameMr: 'गुंतवणूक आणि परतावा', shortNameMr: 'गुंतवणूक', icon: '📈', hue: '135', color: '#22c55e', type: 'income' },
  { id: 'refunds', name: 'Refunds & Cashback', shortName: 'Refunds', nameMr: 'रिफंड आणि कॅशबॅक', shortNameMr: 'कॅशबॅक', icon: '🔄', hue: '195', color: '#06b6d4', type: 'income' },
  { id: 'gifts_in', name: 'Gifts & Splitwise', shortName: 'Gifts', nameMr: 'भेट आणि आहेर', shortNameMr: 'भेट', icon: '🎁', hue: '310', color: '#ec4899', type: 'income' },
  { id: 'other_income', name: 'Other Income', shortName: 'Other Income', nameMr: 'इतर उत्पन्न', shortNameMr: 'इतर उत्पन्न', icon: '💵', hue: '160', color: '#10b981', type: 'income' }
];

export const DEFAULT_PAYMENT_METHODS = [
  { id: 'upi', name: 'UPI', shortName: 'UPI', nameMr: 'UPI', shortNameMr: 'UPI', icon: '⚡', hue: '198', keywords: ['upi', 'gpay', 'google pay', 'phonepe', 'paytm', 'bhim', 'cred upi', 'supermoney', 'famapp', 'यूपीआय', 'जीपे', 'फोनपे', 'पेटीएम'] },
  { id: 'credit_card', name: 'Credit Card', shortName: 'Credit Card', nameMr: 'क्रेडिट कार्ड', shortNameMr: 'कार्ड', icon: '💳', hue: '268', keywords: ['credit card', 'cc', 'amex', 'infinia', 'regalia', 'millennia', 'icici cc', 'hdfc cc', 'sbi cc', 'axis cc', 'hdfccc', 'amazoncc', 'apaycc', 'icicicc', 'sbicc', 'axiscc', 'flipkartcc', 'kotakcc', 'onecard', 'क्रेडिट कार्ड', 'कार्ड'] },
  { id: 'cash', name: 'Cash', shortName: 'Cash', nameMr: 'रोख (Cash)', shortNameMr: 'रोख', icon: '💵', hue: '145', keywords: ['cash', 'rokh', 'रोख', 'कॅश'] },
  { id: 'cashback_wallet', name: 'Cashback / Wallet', shortName: 'Cashback', nameMr: 'कॅशबॅक / वॉलेट', shortNameMr: 'वॉलेट', icon: '🎁', hue: '325', keywords: ['wallet', 'amazon pay', 'apay', 'paytm wallet', 'mobikwik', 'freecharge', 'pluxee', 'sodexo', 'reward points', 'gift card', 'voucher', 'वॉलेट'] },
  { id: 'debit_card', name: 'Debit Card', shortName: 'Debit Card', nameMr: 'डेबिट कार्ड', shortNameMr: 'डेबिट', icon: '🏧', hue: '36', keywords: ['debit card', 'dc', 'atm card', 'डेबिट कार्ड', 'एटीएम'] },
  { id: 'bank', name: 'Bank Transfer', shortName: 'Bank', nameMr: 'बँक ट्रान्सफर', shortNameMr: 'बँक', icon: '🏦', hue: '215', keywords: ['netbanking', 'net banking', 'bank transfer', 'neft', 'imps', 'rtgs', 'cheque', 'auto debit', 'nach', 'बँक'] },
  { id: 'family_paid', name: 'Paid by Family / Others', shortName: 'Family', nameMr: 'कुटुंबाने दिले', shortNameMr: 'कुटुंब', icon: '💝', hue: '340', keywords: ['paid by mom', 'paid by mother', 'paid by aai', 'paid by dad', 'paid by father', 'paid by baba', 'paid by parents', 'paid by brother', 'paid by sister', 'paid by wife', 'paid by husband', 'paid by family', 'by mom', 'by aai', 'by dad', 'by baba', 'by parents', 'mom paid', 'aai paid', 'dad paid', 'baba paid', 'parents paid', 'family paid', 'sponsored', 'aai ne dile', 'aaine dile', 'baba ne dile', 'babanni dile', 'gharchyanni dile', 'आईने दिले', 'बाबांनी दिले', 'घरच्यांनी दिले', 'कुटुंबाने दिले'] }
];

const DEVANAGARI_DIGIT_MAP = {
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9'
};

export function normalizeDevanagariDigits(str) {
  if (!str) return '';
  return String(str).replace(/[०-९]/g, (ch) => DEVANAGARI_DIGIT_MAP[ch] ?? ch);
}

export const EXPENSE_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES];
export const INCOME_CATEGORIES = [...DEFAULT_INCOME_CATEGORIES];
export const CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
export const PAYMENT_METHODS = [...DEFAULT_PAYMENT_METHODS];

const CUSTOM_TAXONOMY_KEY = 'qe_custom_taxonomy_v1';

const COLOR_TO_HUE = {
  '#2a78d6': '210',
  '#eb6834': '20',
  '#1baf7a': '158',
  '#eda100': '42',
  '#e87ba4': '335',
  '#008300': '120',
  '#4a3aa7': '248',
  '#0d9488': '174',
  '#10b981': '160',
  '#14b8a6': '172',
  '#22c55e': '142',
  '#06b6d4': '188',
  '#ec4899': '330',
  '#f43f5e': '350',
  '#8b5cf6': '258',
  '#6366f1': '239',
  '#38bdf8': '198',
  '#898781': '40'
};

function sanitizeKeywordsList(kwInput) {
  if (Array.isArray(kwInput)) {
    return Array.from(
      new Set(
        kwInput
          .map((k) => String(k || '').toLowerCase().trim())
          .filter((k) => k.length >= 2)
      )
    );
  }
  if (typeof kwInput === 'string') {
    return Array.from(
      new Set(
        kwInput
          .split(',')
          .map((k) => k.toLowerCase().trim())
          .filter((k) => k.length >= 2)
      )
    );
  }
  return [];
}

function normalizeCategoryRecord(c, defaultType = 'expense') {
  const type = c?.type === 'income' ? 'income' : defaultType;
  const name = String(c?.name || 'Category').trim();
  const shortName = String(c?.shortName || name).trim() || name;
  const id = String(c?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim();
  const icon = String(c?.icon || (type === 'income' ? '💵' : '📌')).trim() || '📌';
  const color = String(c?.color || (type === 'income' ? '#10b981' : '#2a78d6')).trim();
  const hue = String(c?.hue || COLOR_TO_HUE[color.toLowerCase()] || '160');
  const keywords = sanitizeKeywordsList(
    c?.keywords !== undefined
      ? c.keywords
      : type === 'income'
        ? DEFAULT_INCOME_KEYWORDS[id] || []
        : DEFAULT_KEYWORDS[id] || []
  );
  return { id, name, shortName, icon, hue, color, type, keywords };
}

function normalizePaymentRecord(pm) {
  const name = String(pm?.name || 'Payment').trim();
  const shortName = String(pm?.shortName || name).trim() || name;
  const id = String(pm?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).trim();
  const icon = String(pm?.icon || '💳').trim() || '💳';
  const hue = String(pm?.hue || '198');
  const fallbackDef = DEFAULT_PAYMENT_METHODS.find((d) => d.id === id);
  const keywords = sanitizeKeywordsList(
    pm?.keywords !== undefined ? pm.keywords : fallbackDef?.keywords || [shortName.toLowerCase(), name.toLowerCase()]
  );
  return { id, name, shortName, icon, hue, keywords };
}

export function loadCustomTaxonomy() {
  let stored = null;
  try {
    const raw = localStorage.getItem(CUSTOM_TAXONOMY_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    // ignore storage errors
  }

  const expList =
    Array.isArray(stored?.expenseCategories) && stored.expenseCategories.length > 0
      ? stored.expenseCategories.map((c) => normalizeCategoryRecord(c, 'expense'))
      : DEFAULT_EXPENSE_CATEGORIES.map((c) => normalizeCategoryRecord(c, 'expense'));

  // Always ensure fallback 'other' exists for expenses
  if (!expList.some((c) => c.id === 'other')) {
    expList.push(normalizeCategoryRecord(DEFAULT_EXPENSE_CATEGORIES[DEFAULT_EXPENSE_CATEGORIES.length - 1], 'expense'));
  }

  const incList =
    Array.isArray(stored?.incomeCategories) && stored.incomeCategories.length > 0
      ? stored.incomeCategories.map((c) => normalizeCategoryRecord(c, 'income'))
      : DEFAULT_INCOME_CATEGORIES.map((c) => normalizeCategoryRecord(c, 'income'));

  // Always ensure fallback 'other_income' exists for income
  if (!incList.some((c) => c.id === 'other_income')) {
    incList.push(normalizeCategoryRecord(DEFAULT_INCOME_CATEGORIES[DEFAULT_INCOME_CATEGORIES.length - 1], 'income'));
  }

  const deletedPayIds = Array.isArray(stored?.deletedPaymentIds) ? stored.deletedPaymentIds : [];
  const payList =
    Array.isArray(stored?.paymentMethods) && stored.paymentMethods.length > 0
      ? stored.paymentMethods.map((p) => normalizePaymentRecord(p))
      : DEFAULT_PAYMENT_METHODS.map((p) => normalizePaymentRecord(p));

  if (!payList.some((p) => p.id === 'family_paid') && !deletedPayIds.includes('family_paid')) {
    const famDef = DEFAULT_PAYMENT_METHODS.find((p) => p.id === 'family_paid');
    if (famDef) payList.push(normalizePaymentRecord(famDef));
  }

  EXPENSE_CATEGORIES.splice(0, EXPENSE_CATEGORIES.length, ...expList);
  INCOME_CATEGORIES.splice(0, INCOME_CATEGORIES.length, ...incList);
  CATEGORIES.splice(0, CATEGORIES.length, ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES);
  PAYMENT_METHODS.splice(0, PAYMENT_METHODS.length, ...payList);

  return {
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    paymentMethods: PAYMENT_METHODS,
    updatedAt: Number(stored?.updatedAt) || 0
  };
}

export function getCustomTaxonomySnapshot() {
  let updatedAt = 0;
  try {
    const raw = localStorage.getItem(CUSTOM_TAXONOMY_KEY);
    if (raw) updatedAt = Number(JSON.parse(raw)?.updatedAt) || 0;
  } catch {
    // ignore
  }
  return {
    expenseCategories: EXPENSE_CATEGORIES.map((c) => ({ ...c })),
    incomeCategories: INCOME_CATEGORIES.map((c) => ({ ...c })),
    paymentMethods: PAYMENT_METHODS.map((p) => ({ ...p })),
    updatedAt
  };
}

export function saveCustomTaxonomy({ expenseCategories, incomeCategories, paymentMethods, updatedAt } = {}) {
  const payload = {
    expenseCategories: (expenseCategories || EXPENSE_CATEGORIES).map((c) => normalizeCategoryRecord(c, 'expense')),
    incomeCategories: (incomeCategories || INCOME_CATEGORIES).map((c) => normalizeCategoryRecord(c, 'income')),
    paymentMethods: (paymentMethods || PAYMENT_METHODS).map((p) => normalizePaymentRecord(p)),
    updatedAt: updatedAt || Date.now()
  };
  try {
    localStorage.setItem(CUSTOM_TAXONOMY_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
  return loadCustomTaxonomy();
}

export function resetCustomTaxonomyToDefaults() {
  try {
    localStorage.removeItem(CUSTOM_TAXONOMY_KEY);
  } catch {
    // ignore
  }
  return loadCustomTaxonomy();
}

export function upsertCategoryItem(catInput) {
  const type = catInput?.type === 'income' ? 'income' : 'expense';
  const normalized = normalizeCategoryRecord(catInput, type);
  const targetArr = type === 'income' ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES];
  const idx = targetArr.findIndex((c) => c.id === normalized.id);
  if (idx >= 0) {
    targetArr[idx] = { ...targetArr[idx], ...normalized };
  } else {
    // Insert right before 'other' / 'other_income' so fallback stays at the end
    const fallbackId = type === 'income' ? 'other_income' : 'other';
    const fbIdx = targetArr.findIndex((c) => c.id === fallbackId);
    if (fbIdx >= 0) {
      targetArr.splice(fbIdx, 0, normalized);
    } else {
      targetArr.push(normalized);
    }
  }
  saveCustomTaxonomy({
    expenseCategories: type === 'expense' ? targetArr : EXPENSE_CATEGORIES,
    incomeCategories: type === 'income' ? targetArr : INCOME_CATEGORIES,
    paymentMethods: PAYMENT_METHODS
  });
  return normalized;
}

export function deleteCategoryItem(categoryId) {
  if (categoryId === 'other' || categoryId === 'other_income') return false;
  const nextExp = EXPENSE_CATEGORIES.filter((c) => c.id !== categoryId);
  const nextInc = INCOME_CATEGORIES.filter((c) => c.id !== categoryId);
  saveCustomTaxonomy({
    expenseCategories: nextExp,
    incomeCategories: nextInc,
    paymentMethods: PAYMENT_METHODS
  });
  return true;
}

export function upsertPaymentMethodItem(pmInput) {
  const normalized = normalizePaymentRecord(pmInput);
  const nextPay = [...PAYMENT_METHODS];
  const idx = nextPay.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    nextPay[idx] = { ...nextPay[idx], ...normalized };
  } else {
    nextPay.push(normalized);
  }
  saveCustomTaxonomy({
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    paymentMethods: nextPay
  });
  return normalized;
}

export function deletePaymentMethodItem(paymentId) {
  if (PAYMENT_METHODS.length <= 1) return false;
  const nextPay = PAYMENT_METHODS.filter((p) => p.id !== paymentId);
  if (nextPay.length === 0) return false;
  saveCustomTaxonomy({
    expenseCategories: EXPENSE_CATEGORIES,
    incomeCategories: INCOME_CATEGORIES,
    paymentMethods: nextPay
  });
  return true;
}

export function getPaymentMethodById(id) {
  const normId = id === 'card' ? 'credit_card' : id === 'wallet' ? 'cashback_wallet' : id === 'debit' ? 'debit_card' : id;
  return PAYMENT_METHODS.find((m) => m.id === normId || m.id === id) || PAYMENT_METHODS[0] || DEFAULT_PAYMENT_METHODS[0];
}

export function getCategoryDisplayName(cat, _lang = 'en', short = false) {
  if (!cat) return '';
  return short ? (cat.shortName || cat.name || '') : (cat.name || cat.shortName || '');
}

export function getPaymentDisplayName(pm, _lang = 'en', short = false) {
  if (!pm) return '';
  return short ? (pm.shortName || pm.name || '') : (pm.name || pm.shortName || '');
}

export function isIncomeCategory(categoryId) {
  return INCOME_CATEGORIES.some((c) => c.id === categoryId);
}

export function getCategoriesByType(type = 'expense') {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

export const DEFAULT_INCOME_KEYWORDS = {
  salary: [
    'salary', 'paycheck', 'stipend', 'wages', 'bonus', 'appraisal', 'payout', 'pension',
    'pagar', 'vetan', 'पगार', 'वेतन', 'बोनस', 'मानधन'
  ],
  freelance: [
    'freelance', 'consulting', 'client', 'project payment', 'invoice', 'commission', 'side hustle', 'gig',
    'dhanda', 'vyavsay', 'व्यवसाय', 'धंदा', 'कमिशन'
  ],
  investments: [
    'dividend', 'dividends', 'interest', 'stocks', 'mutual fund', 'fd', 'profit', 'returns', 'capital gain', 'rental income',
    'vyaj', 'munafa', 'faida', 'व्याज', 'नफा', 'परतावा', 'भाडे उत्पन्न'
  ],
  refunds: [
    'refund', 'refunded', 'cashback', 'reimbursement', 'reimbursed', 'reversal', 'claim', 'return',
    'parat', 'partava', 'कॅशबॅक', 'रिफंड'
  ],
  gifts_in: [
    'splitwise', 'settled', 'pocket money', 'allowance', 'shagun', 'gift money', 'paid back', 'returned by',
    'aher', 'bhet', 'आहेर', 'भेट', 'पॉकेट मनी'
  ]
};

export const DEFAULT_KEYWORDS = {
  transport: [
    'fuel', 'petrol', 'diesel', 'cng', 'bike', 'car', 'scooter', 'scooty',
    'auto', 'rickshaw', 'uber', 'ola', 'rapido', 'cab', 'taxi', 'metro',
    'bus', 'train', 'irctc', 'flight', 'indigo', 'toll', 'fastag', 'parking',
    'tyre', 'air', 'service', 'mechanic', 'oil', 'shell', 'hp', 'indian oil', 'bharat petroleum',
    'riksha', 'gadi', 'pravas', 'pmpml', 'रिक्षा', 'ऑटो', 'पेट्रोल', 'डिझेल', 'गाडी', 'प्रवास', 'बस', 'टोल', 'तिकीट', 'पार्किंग'
  ],
  food: [
    'food', 'dinner', 'lunch', 'breakfast', 'brunch', 'snacks', 'snack',
    'coffee', 'chai', 'tea', 'cafe', 'restaurant', 'swiggy', 'zomato',
    'pizza', 'burger', 'biryani', 'momos', 'dosa', 'idli', 'thali', 'samosa',
    'bakery', 'cake', 'icecream', 'dessert', 'drinks', 'beer', 'pub', 'bar',
    'starbucks', 'mcdonalds', 'kfc', 'dominos', 'subway', 'canteen', 'mess', 'tiffin',
    'chaha', 'nashta', 'jevan', 'vadapav', 'vada pav', 'pohe', 'upma', 'misal', 'pav bhaji', 'poli bhaji', 'khanaval', 'dabba',
    'चहा', 'नाश्ता', 'जेवण', 'वडापाव', 'पोहे', 'उपमा', 'मिसळ', 'खाणावळ', 'डबा', 'कॉफी', 'हॉटेल', 'थाळी', 'समोसा'
  ],
  groceries: [
    'grocery', 'groceries', 'milk', 'bread', 'eggs', 'vegetables', 'veggies',
    'fruits', 'fruit', 'blinkit', 'zepto', 'instamart', 'bigbasket', 'dmart',
    'reliance', 'supermarket', 'kirana', 'ration', 'curd', 'paneer', 'chicken',
    'fish', 'meat', 'rice', 'atta', 'oil', 'spices', 'water can', 'bisleri',
    'bhaji', 'bhajipala', 'dudh', 'phale', 'fale', 'kanda', 'batata', 'tandul', 'pith', 'sakhar', 'tel', 'tup',
    'भाजी', 'भाजीपाला', 'किराणा', 'दूध', 'फळे', 'दही', 'तांदूळ', 'पीठ', 'तेल', 'तूप', 'साखर', 'कांदा', 'बटाटा', 'अंडी'
  ],
  bills: [
    'rent', 'electricity', 'power', 'water', 'gas', 'cylinder', 'wifi',
    'broadband', 'internet', 'jio', 'airtel', 'vi', 'bsnl', 'recharge',
    'mobile', 'postpaid', 'prepaid', 'maintenance', 'society', 'maid', 'cook',
    'emi', 'loan', 'insurance', 'tax', 'icloud', 'google one',
    'bhade', 'ghar bhade', 'light bill', 'vij bill', 'pani patti', 'ghar patti', 'gas taki', 'kamwali', 'mavshi',
    'भाडे', 'घरभाडे', 'लाईट बिल', 'वीज बिल', 'पाणी बिल', 'गॅस', 'रिचार्ज', 'कामवाली', 'मावशी', 'हप्ता'
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'zara', 'h&m',
    'uniqlo', 'decathlon', 'shoes', 'shirt', 'tshirt', 'jeans', 'clothes', 'jacket',
    'dress', 'watch', 'bag', 'backpack', 'electronics', 'charger', 'cable',
    'earphones', 'gift', 'present', 'ikea', 'furniture',
    'kapde', 'chappal', 'sadi', 'saree', 'kharedi',
    'कपडे', 'खरेदी', 'चप्पल', 'बूट', 'साडी'
  ],
  health: [
    'medicine', 'meds', 'pharmacy', 'apollo', 'pharmeasy', '1mg', 'doctor',
    'hospital', 'clinic', 'dentist', 'test', 'lab', 'blood', 'gym', 'fitness',
    'protein', 'whey', 'creatine', 'vitamins', 'supplements', 'yoga', 'cult',
    'spectacles', 'lenskart', 'eyewear',
    'aushadh', 'goli', 'davakhana',
    'औषध', 'औषधे', 'दवाखाना', 'डॉक्टर', 'तपासणी', 'चष्मा', 'गोळ्या'
  ],
  entertainment: [
    'movie', 'movies', 'cinema', 'pvr', 'inox', 'bookmyshow', 'netflix',
    'prime', 'hotstar', 'spotify', 'youtube', 'apple music', 'game', 'steam',
    'ps5', 'bowling', 'concert', 'show', 'match', 'turf', 'badminton', 'cricket',
    'subscription', 'book', 'books', 'kindle',
    'natak', 'picture', 'नाटक', 'चित्रपट', 'सिनेमा', 'सहल', 'फिरायला'
  ],
  personal: [
    'haircut', 'salon', 'barber', 'spa', 'grooming', 'laundry', 'dryclean',
    'ironing', 'tailor', 'repair', 'plumber', 'electrician', 'carpenter',
    'cleaning', 'urban company', 'stationery', 'print', 'xerox', 'courier',
    'kes', 'istri', 'dhobi', 'केस', 'सलून', 'इस्त्री', 'दुरुस्ती'
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
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const token of tokens) {
    saveLearnedKeyword(token, categoryId);
  }
}

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

// Initialize custom taxonomy on module load so CATEGORIES & PAYMENT_METHODS reflect saved user edits
loadCustomTaxonomy();

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

  // 1. "day before yesterday" / "parso" / "parva" / "परवा"
  const dbyRegex = /(?:^|\s)(day\s+before\s+yesterday|parso|parva|परवा)(?=\s|$)/i;
  if (dbyRegex.test(working)) {
    targetDate.setDate(targetDate.getDate() - 2);
    working = working.replace(dbyRegex, ' ');
    matchedLabel = '2 days ago';
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
  }

  // 2. "yesterday" / "kal" / "last night" / "काल"
  const yestRegex = /(?:^|\s)(yesterday|last\s+night|kal|काल)(?=\s|$)/i;
  if (yestRegex.test(working)) {
    targetDate.setDate(targetDate.getDate() - 1);
    working = working.replace(yestRegex, ' ');
    matchedLabel = 'Yesterday';
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: matchedLabel };
  }

  // 3. "today" / "aaj" / "this morning" / "tonight" / "आज" / "सकाळी" / "रात्री"
  const todayRegex = /(?:^|\s)(today|aaj|this\s+morning|tonight|आज|सकाळी|रात्री)(?=\s|$)/i;
  if (todayRegex.test(working)) {
    working = working.replace(todayRegex, ' ');
    return { dateStr: toLocalISODate(targetDate), cleanedText: working, dateLabel: 'Today' };
  }

  // 4. "N days ago" / "N दिवसापूर्वी" / "N दिवस आधी"
  const daysAgoRegex = /(?:^|\s)(\d{1,2})\s*(?:days?\s+ago|divsapurvi|divas\s+aadhi|दिवसांपूर्वी|दिवसापूर्वी|दिवस\s+आधी)(?=\s|$)/i;
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

  // Explicit income verbs / phrases (English + Marathi)
  if (/\b(received|credited|earned|income|got\s+paid|paid\s+back)\b/i.test(trimmed) || /(?:^|\s)(मिळाले|जमा|पगार\s+आला)(?=\s|$)/i.test(trimmed)) {
    return 'income';
  }

  // Explicit expense verbs
  if (/\b(spent|debited)\b/i.test(trimmed) || /(?:^|\s)(खर्च\s+झाला|खर्च\s+केले)(?=\s|$)/i.test(trimmed)) {
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

function buildActiveCategoryDictionary(type = 'expense') {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const fallbackDict = type === 'income' ? DEFAULT_INCOME_KEYWORDS : DEFAULT_KEYWORDS;
  const dict = {};
  for (const cat of list) {
    if (cat.id === 'other' || cat.id === 'other_income') continue;
    const customKws = Array.isArray(cat.keywords) ? cat.keywords : [];
    const defaultKws = fallbackDict[cat.id] || [];
    const nameTokens = [cat.shortName, cat.name]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase().trim())
      .filter((s) => s.length >= 3);
    dict[cat.id] = Array.from(new Set([...customKws, ...defaultKws, ...nameTokens]));
  }
  return dict;
}

function escapeRegexLiteral(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Infer category from text using learned keywords first, then active (user + default) category dictionary.
 * If forcedType ('expense' | 'income') is provided, restricts category to that type.
 */
export function inferCategory(text, forcedType = null) {
  const lower = (text || '').toLowerCase().trim();
  const fallback = forcedType === 'income' ? 'other_income' : 'other';
  if (!lower) return fallback;

  const learned = getLearnedKeywords();
  const words = lower.replace(/[^\p{L}\p{M}\p{N}\s&]/gu, ' ').split(/\s+/).filter(Boolean);

  // 1. Check learned user keywords first (exact token match)
  for (const w of words) {
    const learnedCat = learned[w];
    if (learnedCat && CATEGORIES.some((c) => c.id === learnedCat)) {
      if (!forcedType) return learnedCat;
      const isInc = isIncomeCategory(learnedCat);
      if ((forcedType === 'income' && isInc) || (forcedType === 'expense' && !isInc)) {
        return learnedCat;
      }
    }
  }

  const activeIncomeDict = buildActiveCategoryDictionary('income');
  const activeExpenseDict = buildActiveCategoryDictionary('expense');

  // 2. If forcedType is 'income', search income dictionary only
  if (forcedType === 'income') {
    return (
      matchDictionaryExact(lower, words, activeIncomeDict) ||
      matchDictionaryPrefix(words, activeIncomeDict) ||
      'other_income'
    );
  }

  // 3. If forcedType is 'expense', search expense dictionary only
  if (forcedType === 'expense') {
    return (
      matchDictionaryExact(lower, words, activeExpenseDict) ||
      matchDictionaryPrefix(words, activeExpenseDict) ||
      'other'
    );
  }

  // 4. Auto-detect exact matches first: unambiguous income keywords, then expense keywords
  const exactIncome = matchDictionaryExact(lower, words, activeIncomeDict);
  if (exactIncome) return exactIncome;

  const exactExpense = matchDictionaryExact(lower, words, activeExpenseDict);
  if (exactExpense) return exactExpense;

  // 5. Fallback to single-word prefix matches
  const prefixExpense = matchDictionaryPrefix(words, activeExpenseDict);
  if (prefixExpense) return prefixExpense;

  const prefixIncome = matchDictionaryPrefix(words, activeIncomeDict);
  if (prefixIncome) return prefixIncome;

  return 'other';
}

/**
 * Extract payment method (including custom payment methods & custom keywords)
 * and return { paymentMethod, explicitPayment, forcesExpense, cleanedText }
 */
export function extractPaymentMethod(text, defaultPayment = 'upi') {
  let working = text || '';

  // 0. Check custom user-added payment methods or custom keywords first
  for (const pm of PAYMENT_METHODS) {
    const kws = Array.isArray(pm.keywords) ? pm.keywords : [];
    const extraCandidates = [pm.shortName?.toLowerCase(), pm.name?.toLowerCase()]
      .filter((s) => s && s.length >= 2);
    const allTokens = Array.from(new Set([...kws, ...extraCandidates]))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (allTokens.length === 0) continue;
    // Skip built-in default ids here if they haven't been customized so specialized regex order below still runs,
    // OR match custom payment types and custom keywords directly
    const isBuiltInId = ['upi', 'credit_card', 'cash', 'cashback_wallet', 'debit_card', 'bank', 'family_paid'].includes(pm.id);
    const defaultPm = DEFAULT_PAYMENT_METHODS.find((d) => d.id === pm.id);
    const customTokens = isBuiltInId
      ? allTokens.filter((t) => !(defaultPm?.keywords || []).includes(t))
      : allTokens;

    if (customTokens.length > 0) {
      const pattern = customTokens.map((t) => escapeRegexLiteral(t).replace(/\s+/g, '\\s+')).join('|');
      const customRegex = new RegExp(`\\b(?:(?:via|by|on|from|using|with|in|through|thru)\\s+)?(?:${pattern})\\b`, 'i');
      if (customRegex.test(working)) {
        working = working.replace(customRegex, ' ');
        return {
          paymentMethod: pm.id,
          explicitPayment: true,
          forcesExpense: false,
          cleanedText: working
        };
      }
    }
  }

  // 0b. Paid by Family / Others ("paid by mom", "by aai", "aai ne dile", "आईने दिले", "बाबांनी दिले", "sponsored", etc.)
  const familyPayRegex = /(?:^|\s)(?:(?:paid\s+by|covered\s+by|sponsored\s+by|by)\s+(?:mom|mother|aai|dad|father|baba|parents|family|brother|sister|bro|sis|wife|husband|partner|company|office)|(?:mom|mother|aai|dad|father|baba|parents|family)\s+paid|(?:aai\s*ne|aaine|baba\s*ne|babanni|gharchyanni|kutumbane)\s+(?:dile|bharle)|(?:aai|baba|gharchya)\s*kadun|आईने\s+दिले|बाबांनी\s+दिले|घरच्यांनी\s+दिले|कुटुंबाने\s+दिले|आईकडून|बाबांकडून|sponsored)(?=\s|$)/i;
  if (familyPayRegex.test(working)) {
    const matchStr = (working.match(familyPayRegex)?.[0] || '').trim();
    let payerLabel = 'Sponsored';
    const whoMatch = matchStr.match(/\b(mom|mother|aai|dad|father|baba|parents|family|brother|sister|bro|sis|wife|husband|partner|company|office)\b/i);
    if (whoMatch) {
      const whoCap = whoMatch[1].charAt(0).toUpperCase() + whoMatch[1].slice(1).toLowerCase();
      payerLabel = `Paid by ${whoCap}`;
    } else if (/aai|आई/i.test(matchStr)) {
      payerLabel = 'Paid by Aai';
    } else if (/baba|बाबा/i.test(matchStr)) {
      payerLabel = 'Paid by Baba';
    } else if (/ghar|kutumb|घर|कुटुंब/i.test(matchStr)) {
      payerLabel = 'Paid by Family';
    }
    working = working.replace(familyPayRegex, ' ');
    return {
      paymentMethod: 'family_paid',
      explicitPayment: true,
      forcesExpense: true,
      payerLabel,
      cleanedText: working
    };
  }

  // 1. Explicit "from/via/using cashback" or wallet phrases -> expense paid using Cashback/Wallet
  const cashbackPayRegex = /\b(?:(?:from|via|by|using|with|through|thru)\s+(?:cashback|cb|wallet|amazon\s+pay|apay|paytm\s+wallet|reward\s*points?|points|voucher|gift\s*card|pluxee|sodexo)|(?:cashback\s+wallet|cb\s+wallet|amazon\s+pay\s+balance|apay\s+balance|paytm\s+wallet|mobikwik|freecharge|pluxee|sodexo|reward\s+points?))\b/i;
  if (cashbackPayRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'cashback_wallet')) {
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
  if (walletRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'cashback_wallet')) {
    working = working.replace(walletRegex, ' ');
    return {
      paymentMethod: 'cashback_wallet',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 3. Credit Card (supports concatenated shorthands like hdfccc, amazoncc, apaycc, icicicc, sbicc, axiscc, flipkartcc, kotakcc, onecard, amex, or any custom <name>cc!)
  const specificCcRegex = /\b(?:(?:via|by|on|from|using|with)\s+)?(?:(hdfc|amazon|apay|icici|sbi|axis|flipkart|kotak|amex|infinia|regalia|millennia|one|hsbc|idfc|indusind|au|sc|citi|rbl|yes)(?:\s*cc|\s+credit\s+card|\s+card)?|(onecard|amex|infinia|regalia|millennia)|([a-z]{3,14})cc)\b/i;
  const ccMatch = working.match(specificCcRegex);
  if (ccMatch && PAYMENT_METHODS.some((p) => p.id === 'credit_card')) {
    const rawToken = (ccMatch[0] || '').trim().toLowerCase();
    const bankTok = (ccMatch[1] || ccMatch[2] || ccMatch[3] || '').toLowerCase();
    // Only treat bare bank name (like "hdfc" or "amazon") as CC if it had "cc"/"card" OR is an unambiguous card brand (amex/infinia/regalia/millennia/onecard)
    const hasCcSuffix = /cc\b|card\b/i.test(rawToken) || ['amex', 'infinia', 'regalia', 'millennia', 'onecard'].includes(bankTok);
    if (hasCcSuffix) {
      const cardTagMap = {
        hdfc: 'HDFC',
        amazon: 'Amazon',
        apay: 'Amazon',
        icici: 'ICICI',
        sbi: 'SBI',
        axis: 'Axis',
        flipkart: 'Flipkart',
        kotak: 'Kotak',
        amex: 'Amex',
        infinia: 'Infinia',
        regalia: 'Regalia',
        millennia: 'Millennia',
        one: 'OneCard',
        onecard: 'OneCard',
        hsbc: 'HSBC',
        idfc: 'IDFC',
        indusind: 'IndusInd',
        au: 'AU',
        sc: 'StanChart',
        citi: 'Citi',
        rbl: 'RBL',
        yes: 'Yes'
      };
      const creditCardTag = cardTagMap[bankTok] || (bankTok ? bankTok.toUpperCase() : null);
      working = working.replace(specificCcRegex, ' ');
      return {
        paymentMethod: 'credit_card',
        explicitPayment: true,
        forcesExpense: false,
        creditCardTag,
        cleanedText: working
      };
    }
  }

  const ccRegex = /(?:^|\s)(?:(?:via|by|on|from|using|with)\s+)?(?:credit\s+card|cc|क्रेडिट\s+कार्ड|कार्ड)(?=\s|$)/i;
  if (ccRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'credit_card')) {
    working = working.replace(ccRegex, ' ');
    return {
      paymentMethod: 'credit_card',
      explicitPayment: true,
      forcesExpense: false,
      creditCardTag: null,
      cleanedText: working
    };
  }

  // 4. Debit Card (dc, debit card, atm card, डेबिट कार्ड, एटीएम)
  const dcRegex = /(?:^|\s)(?:(?:via|by|on|from|using|with)\s+)?(?:debit\s+card|dc|atm\s+card|डेबिट\s+कार्ड|एटीएम)(?=\s|$)/i;
  if (dcRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'debit_card')) {
    working = working.replace(dcRegex, ' ');
    return {
      paymentMethod: 'debit_card',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 5. Cash (cash, rokh, रोख, कॅश)
  const cashRegex = /(?:^|\s)(?:(?:via|by|in|from|using|with)\s+)?(?:cash|rokh|रोख|कॅश)(?=\s|$)/i;
  if (cashRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'cash')) {
    working = working.replace(cashRegex, ' ');
    return {
      paymentMethod: 'cash',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 6. Bank Transfer (neft, imps, rtgs, netbanking, bank transfer, cheque, बँक)
  const bankRegex = /(?:^|\s)(?:(?:via|by|from|using|with)\s+)?(?:netbanking|net\s+banking|bank\s+transfer|neft|imps|rtgs|cheque|auto\s*debit|nach|बँक)(?=\s|$)/i;
  if (bankRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'bank')) {
    working = working.replace(bankRegex, ' ');
    return {
      paymentMethod: 'bank',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  // 7. UPI (upi, gpay, google pay, phonepe, paytm, bhim, cred upi, supermoney, famapp, यूपीआय, जीपे, फोनपे, पेटीएम)
  const upiRegex = /(?:^|\s)(?:(?:via|by|on|from|using|with)\s+)?(?:upi|gpay|google\s+pay|phonepe|paytm|bhim|cred\s+upi|supermoney|famapp|यूपीआय|जीपे|फोनपे|पेटीएम)(?=\s|$)/i;
  if (upiRegex.test(working) && PAYMENT_METHODS.some((p) => p.id === 'upi')) {
    working = working.replace(upiRegex, ' ');
    return {
      paymentMethod: 'upi',
      explicitPayment: true,
      forcesExpense: false,
      cleanedText: working
    };
  }

  return {
    paymentMethod: defaultPayment || PAYMENT_METHODS[0]?.id || 'upi',
    explicitPayment: false,
    forcesExpense: false,
    cleanedText: working
  };
}

export function extractTags(text) {
  if (!text) return { tags: [], cleanedText: '' };
  const tags = [];
  const seen = new Set();
  const cleanedText = String(text)
    .replace(/(?:^|\s)#([\p{L}\p{M}\p{N}_-]{1,32})(?=\s|$)/gu, (full, tag) => {
      const normalized = tag.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        tags.push(normalized);
      }
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { tags, cleanedText };
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
 * Extract split expense shorthand:
 * - "1200 dinner /3" or "1200 / 3 dinner"
 * - "1200 dinner split 3" or "1200 dinner split by 3"
 * Returns { splitDivisor, cleanedText }
 */
export function extractSplitShorthand(text) {
  if (!text) return { splitDivisor: 1, cleanedText: '' };
  let working = text;

  // Match "/3" or "÷3" (when preceded by whitespace or a digit, and not part of a date like 12/11/2026 or "/-")
  const slashRegex = /(?:^|\s|(?<=\d))\s*(?:\/|÷)\s*([2-9]|1\d|20)\b(?!\s*\/)/i;
  const slashMatch = working.match(slashRegex);
  if (slashMatch) {
    const div = parseInt(slashMatch[1], 10);
    if (div >= 2 && div <= 20) {
      working = working.replace(slashRegex, ' ').replace(/\s+/g, ' ').trim();
      return { splitDivisor: div, cleanedText: working };
    }
  }

  // Match "split 3" or "split by 3" or "split with 3"
  const wordRegex = /\bsplit(?:\s+(?:by|with|among|into))?\s+([2-9]|1\d|20)\b/i;
  const wordMatch = working.match(wordRegex);
  if (wordMatch) {
    const div = parseInt(wordMatch[1], 10);
    if (div >= 2 && div <= 20) {
      working = working.replace(wordRegex, ' ').replace(/\s+/g, ' ').trim();
      return { splitDivisor: div, cleanedText: working };
    }
  }

  return { splitDivisor: 1, cleanedText: working };
}

/**
 * Parse a single expense or income segment like:
 * - "200 fuel bike"
 * - "1500 shoes myntra cc #goa"
 * - "250 coffee from cashback"
 * - "+50000 salary"
 * - "received 450 cashback yesterday"
 */
export function parseSingleExpense(segment, now = new Date(), defaultType = 'expense', defaultPayment = 'upi') {
  if (!segment || !segment.trim()) return null;
  const normSegment = normalizeDevanagariDigits(segment);

  const explicitType = detectExplicitType(normSegment, defaultType);

  // Extract #tags first ("450 dinner #goa")
  const { tags, cleanedText: tagCleanedText } = extractTags(normSegment);

  // Extract recurring monthly keywords ("monthly", "every month", "recurring", "autopay")
  const { recurring, cleanedText: recCleanedText } = extractRecurring(tagCleanedText);

  // Extract date first so numbers in dates ("2 days ago", "15 oct") aren't confused with amounts
  const { dateStr, cleanedText: dateCleanedText, dateLabel } = extractDate(recCleanedText, now);

  // Extract payment method before category inference so "from cashback" or "cc" are stripped cleanly
  const {
    paymentMethod: extractedPayment,
    explicitPayment,
    forcesExpense,
    creditCardTag,
    payerLabel,
    cleanedText: paymentCleanedText
  } = extractPaymentMethod(dateCleanedText, defaultPayment);

  // Extract split shorthand ("1200 dinner /3" or "1200 dinner split 3")
  const { splitDivisor, cleanedText: splitCleanedText } = extractSplitShorthand(paymentCleanedText);

  // Evaluate simple inline addition expressions like "120+80 lunch" or "100 + 50 snacks"
  const mathCleanedText = splitCleanedText.replace(
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
  const cleanedText = mathCleanedText.replace(/(^|\s)[+-]\s*(?=(?:₹|rs\.?|inr\s*|रु\.?\s*|रुपये\s*)?\d)/gi, '$1');

  // Match amount: supports "200", "2,400", "250.50", "1.5k", "₹200", "rs 200", "रु 200", "200/-"
  const amountRegex = /(?:^|\s)(?:₹|rs\.?|inr\s*|रु\.?\s*|रुपये\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?\s*(k)?(?:\s*\/-)?(?=\s|$)/i;
  const match = cleanedText.match(amountRegex);

  if (!match) return null;

  const fullMatch = match[0];
  const intPart = match[1].replace(/,/g, '');
  const decPart = match[2] ? `.${match[2]}` : '';
  const isK = Boolean(match[3]);

  let amount = parseFloat(`${intPart}${decPart}`);
  if (Number.isNaN(amount) || amount <= 0) return null;
  if (isK) amount *= 1000;
  const totalBeforeSplit = Math.round(amount * 100) / 100;
  if (splitDivisor > 1) {
    amount = Math.round((totalBeforeSplit / splitDivisor) * 100) / 100;
  } else {
    amount = totalBeforeSplit;
  }

  // Remove the matched amount token from text to get the item description
  const matchIndex = cleanedText.indexOf(fullMatch);
  const before = cleanedText.slice(0, matchIndex);
  const after = cleanedText.slice(matchIndex + fullMatch.length);
  let note = `${before} ${after}`
    .replace(/^[+-]\s*/, '')
    .replace(/\b(spent|paid|received|credited|earned|got|for|on|from|via|by|using|with|rs\.?|inr|rupees)\b/gi, ' ')
    .replace(/(?:^|\s)(रुपये|रु\.?|दिले|खर्च|मिळाले|साठी)(?=\s|$)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const effectiveExplicitType = forcesExpense && explicitType !== 'income' ? 'expense' : explicitType;
  const forcedType = effectiveExplicitType || (defaultType === 'income' ? 'income' : null);
  const categoryId = inferCategory(note || splitCleanedText, forcedType);
  const resolvedType = isIncomeCategory(categoryId)
    ? 'income'
    : (effectiveExplicitType || defaultType || 'expense');
  const finalCategoryId =
    resolvedType === 'income' && !isIncomeCategory(categoryId)
      ? inferCategory(note || splitCleanedText, 'income')
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

  if (splitDivisor > 1) {
    const fmtTotal = totalBeforeSplit.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    note = `${note} (₹${fmtTotal} ÷ ${splitDivisor})`;
  }
  if (payerLabel && !note.toLowerCase().includes(payerLabel.toLowerCase())) {
    note = `${note} (${payerLabel})`;
  }
  if (creditCardTag && !note.toLowerCase().includes(creditCardTag.toLowerCase())) {
    note = `${note} · ${creditCardTag}`;
  }

  return {
    type: resolvedType,
    amount,
    note,
    category: finalCategoryId,
    paymentMethod: finalPaymentMethod,
    explicitPayment,
    creditCardTag: creditCardTag || null,
    payerLabel: payerLabel || null,
    splitDivisor,
    totalBeforeSplit: splitDivisor > 1 ? totalBeforeSplit : null,
    tags,
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
  const normInput = normalizeDevanagariDigits(input);

  // Split by newlines or commas ONLY when comma is NOT inside a number like 1,200
  const segments = normInput
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
  const normInput = normalizeDevanagariDigits(input);

  const segments = normInput
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
    const { tags, cleanedText: tagCleanedText } = extractTags(seg);
    const { recurring, cleanedText: recCleanedText } = extractRecurring(tagCleanedText);
    const { dateStr, cleanedText: dateCleanedText, dateLabel } = extractDate(recCleanedText, now);
    const {
      paymentMethod: extractedPayment,
      explicitPayment,
      forcesExpense,
      creditCardTag,
      payerLabel,
      cleanedText: paymentCleanedText
    } = extractPaymentMethod(dateCleanedText, defaultPayment);

    let note = paymentCleanedText
      .replace(/^[+-]\s*/, '')
      .replace(/\b(spent|paid|received|credited|earned|got|for|on|from|via|by|using|with|rs\.?|inr|rupees)\b/gi, ' ')
      .replace(/(?:^|\s)(रुपये|रु\.?|दिले|खर्च|मिळाले|साठी)(?=\s|$)/gi, ' ')
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

    if (payerLabel && !note.toLowerCase().includes(payerLabel.toLowerCase())) {
      note = `${note} (${payerLabel})`;
    }
    if (creditCardTag && !note.toLowerCase().includes(creditCardTag.toLowerCase())) {
      note = `${note} · ${creditCardTag}`;
    }

    drafts.push({
      type: resolvedType,
      amount: null,
      note,
      category: finalCategoryId,
      paymentMethod: finalPaymentMethod,
      explicitPayment,
      creditCardTag: creditCardTag || null,
      payerLabel: payerLabel || null,
      tags,
      recurring,
      date: dateStr,
      dateLabel,
      raw: seg,
      missingAmount: true
    });
  }

  return drafts;
}

/**
 * Deterministic Natural-Language Question Parser (Pages 1D, 2.4, 5C)
 * Rule: If input has NO amount, treat it as a question / query!
 * Examples:
 * - "food this month"
 * - "swiggy"
 * - "upi last week"
 * - "#goa"
 * - "transport october"
 * - "how much on coffee this month?"
 */
export function parseQuestionQuery(input, now = new Date()) {
  if (!input || !input.trim()) return null;
  const trimmed = normalizeDevanagariDigits(input).trim();

  // If any segment parses as a valid amount expense, it's an entry, not a question
  const asExpenses = parseExpenseMessage(trimmed, now);
  if (asExpenses.length > 0) return null;
  // Also if it contains standalone digits (like user is mid-typing "200"), not a question
  if (/\d/.test(trimmed.replace(/#[a-zA-Z0-9_-]+/g, ''))) return null;

  let working = trimmed
    .toLowerCase()
    .replace(/[?!.,]+$/g, '')
    .replace(
      /^(?:how\s+much\s+(?:did\s+i\s+spend|spent|on|for)|what\s+(?:did\s+i\s+spend|was\s+my\s+spend)|show\s+(?:me\s+)?|total\s+(?:spent\s+)?(?:on|for)?|spent\s+on)\s+/i,
      ''
    )
    .trim();

  if (!working) return null;

  // 1. Extract #tag filter
  const { tags, cleanedText: afterTags } = extractTags(working);
  working = afterTags;

  // 2. Extract time period filter (default: 'this_month')
  let periodType = 'this_month';
  let periodLabel = '';
  let startDate = '';
  let endDate = '';
  let prevStartDate = '';
  let prevEndDate = '';
  let prevLabel = '';

  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const setMonthToDateSpan = (y, m, maxDay = 31) => {
    const daysInTarget = new Date(y, m + 1, 0).getDate();
    const spanDay = Math.min(maxDay, daysInTarget);
    const start = new Date(y, m, 1);
    const end = new Date(y, m, spanDay);
    const prevM = m === 0 ? 11 : m - 1;
    const prevY = m === 0 ? y - 1 : y;
    const daysInPrev = new Date(prevY, prevM + 1, 0).getDate();
    const prevSpanDay = Math.min(spanDay, daysInPrev);
    const pStart = new Date(prevY, prevM, 1);
    const pEnd = new Date(prevY, prevM, prevSpanDay);

    startDate = toLocalISODate(start);
    endDate = toLocalISODate(end);
    prevStartDate = toLocalISODate(pStart);
    prevEndDate = toLocalISODate(pEnd);
    periodLabel = `${monthShortNames[m]} 1–${spanDay}`;
    prevLabel = `${monthShortNames[prevM]} 1–${prevSpanDay}`;
  };

  // Default to current month-to-date vs previous month same span
  setMonthToDateSpan(year, month, todayDate);

  if (/(?:^|\s)(today|aaj|आज)(?=\s|$)/i.test(working)) {
    periodType = 'today';
    working = working.replace(/(?:^|\s)(today|aaj|आज)(?=\s|$)/i, ' ');
    startDate = toLocalISODate(now);
    endDate = startDate;
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    prevStartDate = toLocalISODate(yest);
    prevEndDate = prevStartDate;
    periodLabel = 'Today';
    prevLabel = 'Yesterday';
  } else if (/(?:^|\s)(yesterday|kal|काल)(?=\s|$)/i.test(working)) {
    periodType = 'yesterday';
    working = working.replace(/(?:^|\s)(yesterday|kal|काल)(?=\s|$)/i, ' ');
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    startDate = toLocalISODate(yest);
    endDate = startDate;
    const dby = new Date(now);
    dby.setDate(dby.getDate() - 2);
    prevStartDate = toLocalISODate(dby);
    prevEndDate = prevStartDate;
    periodLabel = 'Yesterday';
    prevLabel = '2 days ago';
  } else if (/(?:^|\s)(this\s+week|week|हा\s+आठवडा|या\s+आठवड्यात)(?=\s|$)/i.test(working) && !/(?:^|\s)(last\s+week|मागील\s+आठवडा|गेल्या\s+आठवड्यात)(?=\s|$)/i.test(working)) {
    periodType = 'this_week';
    working = working.replace(/(?:^|\s)(this\s+week|week|हा\s+आठवडा|या\s+आठवड्यात)(?=\s|$)/i, ' ');
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0..Sun=6
    const mon = new Date(now);
    mon.setDate(now.getDate() - dayOfWeek);
    startDate = toLocalISODate(mon);
    endDate = toLocalISODate(now);
    const pMon = new Date(mon);
    pMon.setDate(mon.getDate() - 7);
    const pEnd = new Date(now);
    pEnd.setDate(now.getDate() - 7);
    prevStartDate = toLocalISODate(pMon);
    prevEndDate = toLocalISODate(pEnd);
    periodLabel = 'This week';
    prevLabel = 'Last week (same span)';
  } else if (/(?:^|\s)(last\s+week|मागील\s+आठवडा|गेल्या\s+आठवड्यात)(?=\s|$)/i.test(working)) {
    periodType = 'last_week';
    working = working.replace(/(?:^|\s)(last\s+week|मागील\s+आठवडा|गेल्या\s+आठवड्यात)(?=\s|$)/i, ' ');
    const dayOfWeek = (now.getDay() + 6) % 7;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - dayOfWeek);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(thisMon.getDate() - 1);
    const prevMon = new Date(lastMon);
    prevMon.setDate(lastMon.getDate() - 7);
    const prevSun = new Date(lastSun);
    prevSun.setDate(lastSun.getDate() - 7);
    startDate = toLocalISODate(lastMon);
    endDate = toLocalISODate(lastSun);
    prevStartDate = toLocalISODate(prevMon);
    prevEndDate = toLocalISODate(prevSun);
    periodLabel = 'Last week';
    prevLabel = '2 weeks ago';
  } else if (/(?:^|\s)(last\s+month|मागील\s+महिना|गेल्या\s+महिन्यात)(?=\s|$)/i.test(working)) {
    periodType = 'last_month';
    working = working.replace(/(?:^|\s)(last\s+month|मागील\s+महिना|गेल्या\s+महिन्यात)(?=\s|$)/i, ' ');
    const lm = month === 0 ? 11 : month - 1;
    const ly = month === 0 ? year - 1 : year;
    setMonthToDateSpan(ly, lm, 31);
    periodLabel = `${monthShortNames[lm]} ${ly}`;
  } else if (/(?:^|\s)(this\s+month|month|हा\s+महिना|या\s+महिन्यात)(?=\s|$)/i.test(working)) {
    periodType = 'this_month';
    working = working.replace(/(?:^|\s)(this\s+month|month|हा\s+महिना|या\s+महिन्यात)(?=\s|$)/i, ' ');
    setMonthToDateSpan(year, month, todayDate);
  } else if (/\b(this\s+year|year|all\s+time|all)\b/i.test(working)) {
    periodType = 'this_year';
    working = working.replace(/\b(this\s+year|year|all\s+time|all)\b/i, ' ');
    startDate = `${year}-01-01`;
    endDate = toLocalISODate(now);
    prevStartDate = `${year - 1}-01-01`;
    prevEndDate = `${year - 1}-${String(month + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
    periodLabel = `${year} YTD`;
    prevLabel = `${year - 1} YTD`;
  } else {
    // Check explicit month name ("october", "oct", "sep")
    const monthRegex = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
    const mMatch = working.match(monthRegex);
    if (mMatch) {
      const token = mMatch[1].toLowerCase().slice(0, 3);
      const mIdx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(token);
      if (mIdx !== -1) {
        working = working.replace(monthRegex, ' ');
        const targetY = mIdx > month ? year - 1 : year;
        const isCurrentM = targetY === year && mIdx === month;
        setMonthToDateSpan(targetY, mIdx, isCurrentM ? todayDate : 31);
        if (!isCurrentM) {
          periodLabel = `${monthShortNames[mIdx]} ${targetY}`;
        }
      }
    }
  }

  // 3. Extract payment method filter if explicitly mentioned
  const { paymentMethod, explicitPayment, cleanedText: afterPay } = extractPaymentMethod(working, 'upi');
  const filterPayment = explicitPayment ? paymentMethod : null;
  if (explicitPayment) {
    working = afterPay;
  }

  // Clean filler prepositions
  working = working
    .replace(/\b(in|on|for|by|via|from|during|of|the|spend|spending|expenses?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 4. Check if working text matches a Category name directly (including custom categories & Marathi!)
  const catAliases = {
    food: 'food',
    dining: 'food',
    jevan: 'food',
    'जेवण': 'food',
    transport: 'transport',
    travel: 'transport',
    pravas: 'transport',
    'प्रवास': 'transport',
    groceries: 'groceries',
    grocery: 'groceries',
    kirana: 'groceries',
    'किराणा': 'groceries',
    bills: 'bills',
    utilities: 'bills',
    'बिले': 'bills',
    shopping: 'shopping',
    kharedi: 'shopping',
    'खरेदी': 'shopping',
    health: 'health',
    fitness: 'health',
    'आरोग्य': 'health',
    fun: 'entertainment',
    entertainment: 'entertainment',
    'मनोरंजन': 'entertainment',
    personal: 'personal',
    home: 'personal',
    'वैयक्तिक': 'personal',
    other: 'other',
    'इतर': 'other',
    salary: 'salary',
    pagar: 'salary',
    'पगार': 'salary',
    income: 'income_all',
    'उत्पन्न': 'income_all'
  };
  for (const cat of CATEGORIES) {
    if (cat.id) catAliases[cat.id.toLowerCase()] = cat.id;
    if (cat.shortName) catAliases[cat.shortName.toLowerCase()] = cat.id;
    if (cat.name) {
      catAliases[cat.name.toLowerCase()] = cat.id;
      for (const word of cat.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3)) {
        if (!catAliases[word]) catAliases[word] = cat.id;
      }
    }
  }

  let filterCategory = null;
  let itemQuery = '';

  const tokens = working.split(/\s+/).filter(Boolean);
  const remainingTokens = [];
  for (const t of tokens) {
    if (!filterCategory && catAliases[t]) {
      filterCategory = catAliases[t];
    } else {
      remainingTokens.push(t);
    }
  }

  itemQuery = remainingTokens.join(' ').trim();

  const isSpecific = Boolean(
    filterCategory ||
      filterPayment ||
      tags.length > 0 ||
      itemQuery.length >= 2 ||
      periodType !== 'this_month'
  );

  return {
    raw: trimmed,
    isSpecific,
    filterCategory,
    filterPayment,
    tags,
    itemQuery,
    periodType,
    periodLabel,
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    prevLabel
  };
}

