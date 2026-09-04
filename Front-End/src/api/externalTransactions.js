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

function normalizeBrandName(value) {
  const brand = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (brand === 'bfx') return 'bfx';
  if (brand === 'tradekaro') return 'tradeKaro';
  if (brand === 'tradebazaar') return 'tradeBazaar';
  return null;
}

export const getExternalTransactions = (params, brandName) => {
  const config = brandApiConfigs[normalizeBrandName(brandName)];
  if (!config?.baseURL || !config.apiKey) {
    throw new Error(`External transaction API is not configured for brand "${brandName || 'Unknown'}".`);
  }
  return axios.get(`${config.baseURL.replace(/\/$/, '')}/api/v1/external/transaction_logs/get`, {
    params,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
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
  if (!Number.isInteger(perPage) || perPage < 1) {
    throw new Error('A valid frontend page size is required to load external transactions.');
  }
  const { from, to } = getMonthDateRange(month);
  const responses = [];
  for (const [brandKey, accountIds] of accountsByBrand) {
    const brandName = brandKey === 'tradeKaro' ? 'Trade Karo' : brandKey === 'tradeBazaar' ? 'Trade Bazaar' : 'BFX';
    for (const type of ['deposit', 'withdrawal']) {
      const rows = [];
      let page = 1;
      let pageRows = [];
      do {
        const response = await getExternalTransactions({
          ark_ids: [...new Set(accountIds)].join(','),
          from,
          to,
          type,
          page,
          per_page: perPage,
        }, brandName);
        pageRows = response.data?.data || [];
        rows.push(...pageRows);
        page += 1;
      } while (pageRows.length === perPage);
      responses.push(...rows.map((row) => ({
        ...row,
        transaction_type: type,
        amount: Number(row.amount || 0),
      })));
    }
  }
  return responses;
}