import axios from 'axios';

const brandApiConfigs = {
  bfx: {
    baseURL: import.meta.env.VITE_BFX_BASE_URL,
    apiKey: import.meta.env.VITE_BFX_API_KEY,
  },
  tradeKaro: {
    baseURL: import.meta.env.VITE_TRADE_KARO_BASE_URL,
    apiKey: import.meta.env.VITE_TRADE_KARO_API_KEY,
  },
  tradeBazaar: {
    baseURL: import.meta.env.VITE_TRADE_BAZAAR_BASE_URL,
    apiKey: import.meta.env.VITE_TRADE_BAZAAR_API_KEY,
  },
};

const brandDisplayNames = {
  bfx: 'BFX',
  tradeKaro: 'Trade Karo',
  tradeBazaar: 'Trade Bazaar',
};

// Warn once so misconfigured brands are visible in DevTools before any request runs.
Object.entries(brandApiConfigs).forEach(([key, cfg]) => {
  if (!cfg.baseURL || !cfg.apiKey) {
    console.warn(`[external-transactions] ${brandDisplayNames[key]} is missing VITE_${key === 'bfx' ? 'BFX' : key === 'tradeKaro' ? 'TRADE_KARO' : 'TRADE_BAZAAR'}_BASE_URL or _API_KEY in Front-End/.env`);
  }
});

function normalizeBrandName(value) {
  const brand = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (brand === 'bfx') return 'bfx';
  if (brand === 'tradekaro') return 'tradeKaro';
  if (brand === 'tradebazaar') return 'tradeBazaar';
  return null;
}

function getTransactionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.data)) return payload.data;
  return [payload.transactions, payload.results, payload.rows, payload.items]
    .find(Array.isArray) || [];
}

function getTransactionAmount(row) {
  const value = row.amount
    ?? row.transaction_amount
    ?? row.transactionAmount
    ?? row.deposit_amount
    ?? row.withdrawal_amount
    ?? row.value
    ?? 0;
  const normalized = String(value).replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export const getExternalTransactions = (params, brandName) => {
  const brandKey = normalizeBrandName(brandName);
  const config = brandApiConfigs[brandKey];
  if (!config?.baseURL || !config.apiKey) {
    throw new Error(`External transaction API is not configured for ${brandDisplayNames[brandKey] || brandName || 'Unknown'}.`);
  }
  return axios.get(`${config.baseURL.replace(/\/$/, '')}/api/v1/external/transaction_logs/get`, {
    params,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-Key': config.apiKey,
    },
  });
};

export function getMonthDateRange(month) {
  if (!month) return { from: '', to: '' };
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export async function getExternalTransactionRows(accounts, month, perPage) {
  const accountsByBrand = new Map();
  accounts.forEach((account) => {
    const accountId = typeof account === 'object' ? account.accountId : account;
    const brandName = typeof account === 'object' ? account.brandName : null;
    const brandKey = normalizeBrandName(brandName);
    if (!accountId || !brandKey) return;
    if (!accountsByBrand.has(brandKey)) accountsByBrand.set(brandKey, []);
    accountsByBrand.get(brandKey).push(String(accountId));
  });
  if (!accountsByBrand.size) return [];
  const { from, to } = getMonthDateRange(month);
  const responses = [];
  for (const [brandKey, accountIds] of accountsByBrand) {
    const brandName = brandDisplayNames[brandKey];
    for (const type of ['deposit', 'withdrawal']) {
      const rows = [];
      const uniqueAccountIds = [...new Set(accountIds)];
      let page = 1;
      let pageRows = [];
      const requestPageSize = Math.max(Number(perPage) || 100, 100);
      try {
        do {
          const response = await getExternalTransactions({
            ark_ids: uniqueAccountIds.join(','),
            from,
            to,
            type,
            page,
            per_page: requestPageSize,
          }, brandName);
          pageRows = getTransactionRows(response.data?.data ?? response.data);
          rows.push(...pageRows);
          page += 1;
        } while (pageRows.length >= requestPageSize);
      } catch (error) {
        console.warn(`${brandName} ${type} transactions unavailable. Check its URL and API key:`, error);
        continue;
      }
      responses.push(...rows.map((row) => ({
        ...row,
        accountId: row.accountId || row.account_id || row.ark_id || row.arkId || row.ark,
        transaction_type: type,
        amount: getTransactionAmount(row),
        createdDate: row.createdDate || row.created_at || row.date || row.transaction_date,
      })));
    }
  }
  return responses;
}