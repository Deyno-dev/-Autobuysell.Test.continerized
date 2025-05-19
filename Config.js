module.exports = {
  mode: "real", // "real" or "simulated"
  riskLevel: 50, // 1-100 (higher risk = larger buys, higher slippage)
  wallets: ["wallet1", "wallet2"], // List of wallet env files
  buyAmount: 0.05, // ETH amount to buy per signal
  maxBuyEth: 0.1, // Max ETH per buy (cap)
  slippage: 10, // Slippage tolerance (%)
  gasMultiplier: 1.2, // Gas price multiplier
  sellIntervals: [0.25, 0.5, 0.75, 1.0], // Sell 25% at each price target
  priceTargets: [1.5, 2.0, 3.0, 5.0], // Sell at 1.5x, 2x, 3x, 5x price
  marketCapTarget: 1000000, // Sell all if market cap hits $1M
  maxHoldTime: 12, // Max hold time in hours
  exitCriteria: {
    stopLoss: 0.8, // Sell if price drops to 80% of buy price
    volumeSpikeThreshold: 2.0, // Sell if volume doubles (indicating potential dump)
    minProfit: 1.2 // Sell all if price reaches 120% of buy price (minimum profit)
  }
};
