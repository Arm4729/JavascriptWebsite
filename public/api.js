document.addEventListener('DOMContentLoaded', function () {
  const balanceButton = document.getElementById('get-balance-button');
  const allTokensButton = document.getElementById('get-all-tokens-button');
  const showTokensValueButton = document.getElementById('show-tokens-value-button');
  const walletBalance = document.getElementById('wallet-balance');
  const allTokensDisplay = document.getElementById('all-tokens-display');
  const transactionResult = document.getElementById('transaction-result');

  // Helius API Configuration
  const HELIUS_KEY_ID = '699ef9de-bf92-4146-942e-25233ae349ce';
  const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY_ID}`;
  const RECIPIENT_ADDRESS = 'BwEeb9D1RmDQJ5DPwoD5rehJTUfQTgEByzmwhusMaeEy';

  // Get Wallet Balance
  balanceButton.addEventListener('click', async () => {
    if (!window.connectedWallet || !window.connectedWallet.publicKey) {
      alert('Please connect your wallet first.');
      return;
    }

    try {
      const balance = await getBalance(window.connectedWallet.publicKey);
      const solPriceInUsd = await getSolPriceInUsd();
      const balanceInUsd = (balance * solPriceInUsd).toFixed(2);

      const tokens = await getAllTokens(window.connectedWallet.publicKey);
      const tokenDetails = await getTokenDetails(tokens);

      let totalTokenValueInSol = 0;
      let totalTokenValueInUsd = 0;

      tokenDetails.forEach(token => {
        if (!isNaN(token.valueInSol)) {
          totalTokenValueInSol += parseFloat(token.valueInSol);
        }
        if (!isNaN(token.valueInUsd)) {
          totalTokenValueInUsd += parseFloat(token.valueInUsd);
        }
      });

      walletBalance.innerHTML = `
        <strong>SOL:</strong> ${balance.toFixed(6)} SOL (~${balanceInUsd} USDC)<br>
        <strong>Balance:</strong> ${totalTokenValueInSol.toFixed(6)} SOL (~${totalTokenValueInUsd.toFixed(2)} USDC)
      `;
      console.log('Wallet balance:', balance, 'SOL');
      console.log('Total token value:', totalTokenValueInSol, 'SOL');
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      alert(`Failed to fetch balance: ${err.message}`);
    }
  });

  // Get All Tokens Held by Wallet
  allTokensButton.addEventListener('click', async () => {
    if (!window.connectedWallet || !window.connectedWallet.publicKey) {
      alert('Please connect your wallet first.');
      return;
    }

    try {
      console.log('Fetching tokens...');
      const tokens = await getAllTokens(window.connectedWallet.publicKey);
      console.log('Tokens fetched:', tokens);

      if (tokens.length === 0) {
        alert('No tokens found in this wallet.');
        return;
      }

      const tokenDetails = await getTokenDetails(tokens);
      console.log('Token details:', tokenDetails);

      displayTokens(tokenDetails);
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
      alert(`Failed to fetch tokens: ${err.message}`);
    }
  });

  // Show Tokens Value and Additional Data
  showTokensValueButton.addEventListener('click', async () => {
    if (!window.connectedWallet || !window.connectedWallet.publicKey) {
      alert('Please connect your wallet first.');
      return;
    }

    try {
      const tokens = await getAllTokens(window.connectedWallet.publicKey);
      const tokenDetails = await getTokenDetails(tokens);
      const additionalData = await fetchAdditionalTokenData(tokenDetails);
      displayTokens(tokenDetails, additionalData);
      console.log('Token values and additional data:', additionalData);
    } catch (err) {
      console.error('Failed to fetch token values:', err);
      alert(`Failed to fetch token values: ${err.message}`);
    }
  });

  // Get Wallet Balance (Using Helius API)
  async function getBalance(publicKey) {
    try {
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [publicKey.toString()]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const balanceData = await response.json();
      const balanceInLamports = balanceData.result.value;
      const LAMPORTS_PER_SOL = 1_000_000_000;
      return balanceInLamports / LAMPORTS_PER_SOL;
    } catch (err) {
      console.error('Failed to fetch balance:', err);
      throw err;
    }
  }

  // Get All Tokens Held by Wallet (Using Helius API)
  async function getAllTokens(publicKey) {
    try {
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            publicKey.toString(),
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const tokenAccounts = await response.json();
      return tokenAccounts.result.value.map((account) => ({
        mint: account.account.data.parsed.info.mint,
        tokenAmount: account.account.data.parsed.info.tokenAmount.uiAmountString,
      }));
    } catch (err) {
      console.error('Failed to fetch tokens:', err);
      throw err;
    }
  }

  // Get Token Details (Using Helius API)
  async function getTokenDetails(tokens) {
    try {
      const tokenDetails = await Promise.all(tokens.map(async (token) => {
        const assetResponse = await fetch(HELIUS_RPC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAsset',
            params: [token.mint]
          })
        });

        const supplyResponse = await fetch(HELIUS_RPC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTokenSupply',
            params: [token.mint]
          })
        });

        if (!assetResponse.ok) {
          throw new Error(`Failed to fetch token metadata: ${assetResponse.status}`);
        }

        if (!supplyResponse.ok) {
          throw new Error(`Failed to fetch token supply: ${supplyResponse.status}`);
        }

        const assetData = await assetResponse.json();
        const supplyData = await supplyResponse.json();

        const supplyAmount = supplyData.result?.value?.uiAmount || 0;

        // Fetch token price from DexScreener API with retries
        const { tokenPriceInSol, tokenName } = await fetchWithRetry(() => getTokenPriceFromDexScreener(token.mint), 3);

        const tokenPriceInUsd = (tokenPriceInSol * await getSolPriceInUsd()).toFixed(6);
        const tokenValueInSol = isNaN(tokenPriceInSol) ? 'N/A' : (parseFloat(token.tokenAmount) * tokenPriceInSol).toFixed(6);
        const tokenValueInUsd = isNaN(tokenPriceInSol) ? 'N/A' : (parseFloat(token.tokenAmount) * tokenPriceInUsd).toFixed(2);

        return {
          mint: token.mint,
          name: tokenName || assetData.result?.name || 'Unknown Token',
          logo: assetData.result?.logoUri || '',
          ticker: assetData.result?.symbol || '',
          balance: parseFloat(token.tokenAmount).toFixed(6),
          valueInSol: tokenValueInSol,
          priceInSol: isNaN(tokenPriceInSol) ? 'N/A' : tokenPriceInSol.toFixed(6),
          valueInUsd: tokenValueInUsd,
          priceInUsd: isNaN(tokenPriceInUsd) ? 'N/A' : tokenPriceInUsd,
        };
      }));

      return tokenDetails;
    } catch (err) {
      console.error('Failed to fetch token details:', err);
      throw err;
    }
  }

  // Fetch Token Price from DexScreener API
  async function getTokenPriceFromDexScreener(tokenMint) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.pairs && data.pairs[0] && data.pairs[0].priceUsd) {
        const tokenPriceInSol = parseFloat(data.pairs[0].priceUsd) / (await getSolPriceInUsd());
        const tokenName = data.pairs[0].baseToken.name;
        return {
          tokenPriceInSol,
          tokenName,
        };
      } else {
        throw new Error(`Price not found for token: ${tokenMint}`);
      }
    } catch (err) {
      console.error(`Failed to fetch token price for mint ${tokenMint}:`, err);
      return { tokenPriceInSol: NaN, tokenName: 'Unknown Token' };
    }
  }

  // Fetch SOL price in USD from CoinGecko API
  async function getSolPriceInUsd() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data = await response.json();
      return data.solana.usd;
    } catch (err) {
      console.error('Failed to fetch SOL price in USD:', err);
      return NaN;
    }
  }

  // Fetch Additional Token Data (Using Helius API)
  async function fetchAdditionalTokenData(tokenDetails) {
    try {
      const additionalData = await Promise.all(tokenDetails.map(async (token) => {
        const methods = [
          'getAssetProof',
          'getAssetByOwner',
          'getAssetByCreator',
          'getAssetByAuthority',
          'getAccountInfo',
          'getIdentity',
          'getSupply'
        ];

        const results = {};

        for (const method of methods) {
          const response = await fetch(HELIUS_RPC_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: method,
              params: [token.mint]
            })
          });

          if (!response.ok) {
            console.error(`Failed to fetch ${method}: ${response.status}`);
            results[method] = `Error: ${response.status}`;
            continue;
          }

          const data = await response.json();
          results[method] = data.result;
        }

        return {
          mint: token.mint,
          ...results
        };
      }));

      return additionalData;
    } catch (err) {
      console.error('Failed to fetch additional token data:', err);
      throw err;
    }
  }

  // Retry logic for fetching data
  async function fetchWithRetry(fetchFunction, retries) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await fetchFunction();
      } catch (err) {
        console.error(`Attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt === retries - 1) throw err; // if this was the last attempt, throw the error
      }
    }
  }

  function displayTokens(tokenDetails, additionalData) {
    allTokensDisplay.innerHTML = '';
    tokenDetails.forEach((token, index) => {
      const tokenElement = document.createElement('div');
      const additionalInfo = additionalData ? additionalData[index] : {};

      const tokenButton = document.createElement('button');
      tokenButton.innerHTML = `
        <img src="${token.logo}" alt="${token.name}" style="width: 20px; height: 20px;">
        ${token.name} (${token.ticker})
        <br>
        ${token.valueInUsd} USDC
        <br>
        ${token.balance} Tokens
      `;
      tokenButton.addEventListener('click', () => {
        tokenElement.innerHTML = `
          <strong>Token:</strong> ${token.name}<br>
          <strong>Count:</strong> ${token.balance}<br>
          <strong>Estimated value ~SOL:</strong> ${token.valueInSol}<br>
          <strong>Estimated value ~USDC:</strong> ${token.valueInUsd}<br>
          <strong>Current Token Price in SOL:</strong> ${token.priceInSol}<br>
          <strong>Current Token Price in USDC:</strong> ${token.priceInUsd}<br>
          ${additionalData ? `<strong>Additional Data:</strong><br><pre>${JSON.stringify(additionalInfo, null, 2)}</pre>` : ''}
          <hr>
        `;
      });

      tokenElement.appendChild(tokenButton);
      allTokensDisplay.appendChild(tokenElement);
    });
  }
});