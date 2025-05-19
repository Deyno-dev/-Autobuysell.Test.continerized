
require("dotenv").config();

const TelegramBot = require("node-telegram-bot-api");

const { ethers } = require("ethers");

const axios = require("axios");

const { shouldSell, getPriceTarget } = require("./model/sell_decision");

const config = require("./config");

  

// Environment variables

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const UNISWAP_ROUTER_ADDRESS = process.env.UNISWAP_ROUTER_ADDRESS;

const DEXTOOLS_API_KEY = process.env.DEXTOOLS_API_KEY;

  

// Initialize wallets

const wallets = config.wallets.map((walletName) => {

  require("dotenv").config({ path: `.env.${walletName}` });

  const provider = new ethers.JsonRpcProvider(process.env.INFURA_URL);

  return new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

});

  

// Uniswap Router (simplified ABI)

const UNISWAP_ABI = [

  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",

  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"

];

const uniswapContracts = wallets.map((wallet) => new ethers.Contract(UNISWAP_ROUTER_ADDRESS, UNISWAP_ABI, wallet));

  

// Track bought tokens per wallet

const boughtTokens = new Map(); // walletAddress -> { tokenAddress -> { amount, buyPrice, buyTime, soldPortions, initialVolume } }

  

// Telegram bot

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  

// Fetch token data from DEXtools

async function getTokenData(tokenAddress) {

  try {

    const response = await axios.get(

      `[https://api.dextools.io/v1/token?chain=ether&address=${tokenAddress}`](https://api.dextools.io/v1/token?chain=ether&address=$%7BtokenAddress%7D),

      { headers: { "X-API-Key": DEXTOOLS_API_KEY } }

    );

    const { price, volume24h, liquidity, marketCap } = response.data.data;

    return { price, volume: volume24h, liquidity, marketCap };

  } catch (error) {

    console.error("DEXtools API error:", error.message);

    return null;

  }

}

  

// Validate token

async function validateToken(tokenAddress) {

  const data = await getTokenData(tokenAddress);

  if (!data) return false;

  const minLiquidity = 10000 * (config.riskLevel / 100);

  const minVolume = 50000 * (config.riskLevel / 100);

  if (data.liquidity < minLiquidity || data.volume < minVolume) {

    console.log("Token failed validation: low liquidity or volume");

    return false;

  }

  return data;

}

  

// Execute buy order

async function executeBuy(wallet, uniswap, tokenAddress, amountEth) {

  if (config.mode === "simulated") {

    console.log(`Simulated buy: ${amountEth} ETH of ${tokenAddress}`);

    return { transactionHash: "simulated" };

  }

  const path = [ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"), tokenAddress]; // WETH -> Token

  const amountOutMin = 0;

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  

  const tx = await uniswap.swapExactETHForTokens(

    amountOutMin,

    path,

    wallet.address,

    deadline,

    { value: ethers.parseEther(amountEth.toString()), gasLimit: 250000, gasPrice: (await wallet.provider.getFeeData()).gasPrice * config.gasMultiplier }

  );

  const receipt = await tx.wait();

  const tokenData = await getTokenData(tokenAddress);

  const walletBought = boughtTokens.get(wallet.address) || new Map();

  walletBought.set(tokenAddress, {

    amount: amountEth,

    buyPrice: tokenData.price,

    buyTime: Date.now(),

    soldPortions: 0,

    initialVolume: tokenData.volume

  });

  boughtTokens.set(wallet.address, walletBought);

  return receipt;

}

  

// Execute sell order

async function executeSell(wallet, uniswap, tokenAddress, portion) {

  if (config.mode === "simulated") {

    console.log(`Simulated sell: ${portion * 100}% of ${tokenAddress}`);

    return { transactionHash: "simulated" };

  }

  const walletBought = boughtTokens.get(wallet.address);

  const tokenData = walletBought.get(tokenAddress);

  const amountToSell = ethers.parseUnits((tokenData.amount * portion).toString(), 18);

  const path = [tokenAddress, ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2")];

  const amountOutMin = 0;

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  

  const tx = await uniswap.swapExactTokensForETH(

    amountToSell,

    amountOutMin,

    path,

    wallet.address,

    deadline,

    { gasLimit: 250000, gasPrice: (await wallet.provider.getFeeData()).gasPrice * config.gasMultiplier }

  );

  const receipt = await tx.wait();

  tokenData.soldPortions += portion;

  if (tokenData.soldPortions >= 1) walletBought.delete(tokenAddress);

  return receipt;

}

  

// Monitor for sell signals

setInterval(async () => {

  for (let i = 0; i < wallets.length; i++) {

    const wallet = wallets[i];

    const uniswap = uniswapContracts[i];

    const walletBought = boughtTokens.get(wallet.address) || new Map();

    for (const [tokenAddress, { buyPrice, buyTime, soldPortions, initialVolume }] of walletBought) {

      const tokenData = await getTokenData(tokenAddress);

      if (!tokenData) continue;

  

      // Check max hold time

      const hoursElapsed = (Date.now() - buyTime) / (1000 * 60 * 60);

      if (hoursElapsed > config.maxHoldTime) {

        await executeSell(wallet, uniswap, tokenAddress, 1 - soldPortions);

        console.log(`Sold all ${tokenAddress} due to max hold time`);

        continue;

      }

  

      // Check market cap target

      if (tokenData.marketCap >= config.marketCapTarget) {

        await executeSell(wallet, uniswap, tokenAddress, 1 - soldPortions);

        console.log(`Sold all ${tokenAddress} due to market cap target`);

        continue;

      }

  

      // Check exit criteria

      const priceRatio = tokenData.price / buyPrice;

      if (priceRatio <= config.exitCriteria.stopLoss) {

        await executeSell(wallet, uniswap, tokenAddress, 1 - soldPortions);

        console.log(`Sold all ${tokenAddress} due to stop-loss`);

        continue;

      }

      if (tokenData.volume > initialVolume * config.exitCriteria.volumeSpikeThreshold) {

        await executeSell(wallet, uniswap, tokenAddress, 1 - soldPortions);

        console.log(`Sold all ${tokenAddress} due to volume spike`);

        continue;

      }

      if (priceRatio >= config.exitCriteria.minProfit && soldPortions === 0) {

        await executeSell(wallet, uniswap, tokenAddress, 1 - soldPortions);

        console.log(`Sold all ${tokenAddress} due to minimum profit`);

        continue;

      }

  

      // Check incremental sell targets

      const priceTarget = getPriceTarget(buyPrice, soldPortions);

      if (shouldSell(tokenData, buyPrice, priceTarget)) {

        const portion = config.sellIntervals[Math.floor(soldPortions / 0.25)];

        await executeSell(wallet, uniswap, tokenAddress, portion);

        console.log(`Sold ${portion * 100}% of ${tokenAddress}`);

      }

    }

  }

}, 5 * 60 * 1000); // Check every 5 minutes

  

// Telegram message handler

bot.on("message", async (msg) => {

  const chatId = [msg.chat.id](http://msg.chat.id/);

  const text = msg.text;

  

  if (text && text.includes("Buy!") && text.includes("Got")) {

    try {

      // Extract token name

      const tokenNameMatch = text.match(/^(\w+) Buy!/);

      if (!tokenNameMatch) throw new Error("Token name not found");

      const tokenName = tokenNameMatch[1];

  

      // Fetch token address from DEXtools (simplified, use proper API call)

      const response = await axios.get(

        `[https://api.dextools.io/v1/token?chain=ether&symbol=${tokenName}`](https://api.dextools.io/v1/token?chain=ether&symbol=$%7BtokenName%7D),

        { headers: { "X-API-Key": DEXTOOLS_API_KEY } }

      );

      const tokenAddress = response.data.data.address;

      if (!ethers.isAddress(tokenAddress)) throw new Error("Invalid token address");

  

      // Validate token

      const validationData = await validateToken(tokenAddress);

      if (!validationData) {

        bot.sendMessage(chatId, "Token failed validation");

        return;

      }

  

      // Determine buy amount

      let amountEth = config.buyAmount;

      amountEth = Math.min(amountEth * (config.riskLevel / 100), config.maxBuyEth);

  

      // Distribute buy across wallets

      const amountPerWallet = amountEth / wallets.length;

      for (let i = 0; i < wallets.length; i++) {

        const receipt = await executeBuy(wallets[i], uniswapContracts[i], tokenAddress, amountPerWallet);

        bot.sendMessage(chatId, `Bought ${amountPerWallet} ETH of ${tokenAddress} with wallet ${i + 1}: ${receipt.transactionHash}`);

      }

    } catch (error) {

      bot.sendMessage(chatId, `Error: ${error.message}`);

    }

  }

});

  

console.log("Pachiko trading bot started...");
