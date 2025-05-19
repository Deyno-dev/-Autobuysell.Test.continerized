function shouldSell(tokenData, buyPrice, priceTarget) {
  const { price } = tokenData;
  return price >= priceTarget;
}

function getPriceTarget(buyPrice, soldPortions) {
  const config = require("../config");
  const nextIntervalIndex = Math.floor(soldPortions / 0.25);
  const multiplier = config.priceTargets[nextIntervalIndex] || config.priceTargets[config.priceTargets.length - 1];
  return buyPrice * multiplier;
}

module.exports = { shouldSell, getPriceTarget };
