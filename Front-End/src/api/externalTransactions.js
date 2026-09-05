import axiosInstance from './axiosInstance';
import { syncExternalTransactionTotals } from './clients';

const brandDisplayNames = {
  bfx: 'BFX',
  tradeKaro: 'Trade Karo',
  tradeBazaar: 'Trade Bazaar',
};

function normalizeBrandName(value) {
  const brand = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (brand === 'bfx' || brand === 'bazaarfx') return 'bfx';
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
  if (!brandKey) {
    throw new Error(`Unsupported transaction brand "${brandName || 'Unknown'}".`);
  }
  return axiosInstance.get('external-transactions/', {
    params: { ...params, brand: brandKey },
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
};

export function getMonthDateRange(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || '').trim());
  if (!match) return { from: '', to: '' };

  const [, year, monthNumber] = match;
  const lastDay = new Date(Date.UTC(Number(year), Number(monthNumber), 0)).getUTCDate();
  return {
    from: `${year}-${monthNumber}-01`,
    to: `${year}-${monthNumber}-${String(lastDay).padStart(2, '0')}`,
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
      let pageRows;
      const requestPageSize = Math.max(Number(perPage) || 1, 1);
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

      if (month) {
        const totalsByAccount = new Map(uniqueAccountIds.map((accountId) => [accountId, 0]));
        rows.forEach((row) => {
          const accountId = row.accountId || row.account_id || row.ark_id || row.arkId || row.ark;
          if (!accountId) return;
          const key = String(accountId);
          totalsByAccount.set(key, (totalsByAccount.get(key) || 0) + getTransactionAmount(row));
        });
        try {
          await syncExternalTransactionTotals({
            month,
            type,
            totals: [...totalsByAccount.entries()].map(([account_id, amount]) => ({ account_id, amount })),
          });
        } catch (error) {
          console.warn(`${brandName} ${type} totals could not be saved:`, error);
        }
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