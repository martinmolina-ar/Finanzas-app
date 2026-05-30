// GET /api/prices?tickers=BTC,ETH,SOL
// Returns current prices from CoinGecko (crypto)

const COINGECKO_IDS = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'USDT': 'tether',
  'BNB': 'binancecoin', 'ADA': 'cardano', 'XRP': 'ripple', 'DOGE': 'dogecoin',
  'MATIC': 'matic-network', 'DOT': 'polkadot', 'AVAX': 'avalanche-2',
  'LINK': 'chainlink', 'UNI': 'uniswap', 'LTC': 'litecoin', 'BCH': 'bitcoin-cash',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { tickers = '' } = req.query;
  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  if (!tickerList.length) return res.json({ prices: {} });

  const cryptoTickers = tickerList.filter(t => COINGECKO_IDS[t]);
  const prices = {};

  if (cryptoTickers.length) {
    try {
      const ids = cryptoTickers.map(t => COINGECKO_IDS[t]).join(',');
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,ars`);
      const data = await r.json();
      cryptoTickers.forEach(ticker => {
        const id = COINGECKO_IDS[ticker];
        if (data[id]) {
          prices[ticker] = { usd: data[id].usd, ars: data[id].ars };
        }
      });
    } catch (err) {
      console.error('[prices] CoinGecko error:', err);
    }
  }

  res.json({ ok: true, prices });
}
