const HELIUS_RPC_URL = 'https://rpc.ankr.com/solana';
const SOLANA_RPC_URL = 'https://rpc.ankr.com/solana'; // New Solana RPC URL

export async function getBalance(publicKey) {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
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
    const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;
    console.log('Fetched balance:', balanceInSol, 'SOL');
    return balanceInSol;
  } catch (err) {
    console.error('Failed to fetch balance:', err);
    throw err;
  }
}

export async function getAllTokens(publicKey) {
  try {
    const response = await fetch(SOLANA_RPC_URL, {
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
    const tokenList = tokenAccounts.result.value.map((account) => ({
      mint: account.account.data.parsed.info.mint,
      tokenAmount: account.account.data.parsed.info.tokenAmount.uiAmountString,
    }));

    // Fetch SOL balance
    const solBalance = await getBalance(publicKey);
    tokenList.unshift({ mint: 'SOL', tokenAmount: solBalance.toFixed(6) });

    return tokenList;
  } catch (err) {
    console.error('Failed to fetch tokens:', err);
    throw err;
  }
}

export async function getTokenDetails(tokens) {
  try {
    const tokenDetails = await Promise.all(tokens.map(async (token) => {
      if (token.mint === 'SOL') {
        const solPriceInUsd = await getSolPriceInUsd();
        const tokenPriceInSol = 1; // 1 SOL = 1 SOL
        const tokenPriceInUsd = solPriceInUsd;
        const tokenValueInUsd = (parseFloat(token.tokenAmount) * tokenPriceInUsd).toFixed(2);

        return {
          mint: 'SOL',
          name: 'Solana',
          balance: token.tokenAmount,
          valueInSol: token.tokenAmount,
          priceInSol: tokenPriceInSol.toFixed(6),
          valueInUsd: tokenValueInUsd,
          priceInUsd: tokenPriceInUsd.toFixed(6),
          logoUrl: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png', // SOL logo URL
        };
      }

      const assetResponse = await fetch(SOLANA_RPC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [token.mint, { encoding: 'jsonParsed' }]
        })
      });

      const supplyResponse = await fetch(SOLANA_RPC_URL, {
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
        balance: parseFloat(token.tokenAmount).toFixed(6),
        valueInSol: tokenValueInSol,
        priceInSol: isNaN(tokenPriceInSol) ? 'N/A' : tokenPriceInSol.toFixed(6),
        valueInUsd: tokenValueInUsd,
        priceInUsd: isNaN(tokenPriceInUsd) ? 'N/A' : tokenPriceInUsd,
        logoUrl: assetData.result?.content?.links?.image || 'https://via.placeholder.com/30', // Fetch logo URL from Helius API
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
export async function getSolPriceInUsd() {
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
export async function displayTokens(publicKey, tokenDetails) {
  try {
    const allTokensDisplay = document.getElementById('all-tokens-display');
    allTokensDisplay.innerHTML = ''; // Clear previous content

    // Sort tokens by valueInUsd in descending order
    const sortedTokens = tokenDetails.sort((a, b) => {
      const valueA = a.valueInUsd === 'N/A' ? 0 : parseFloat(a.valueInUsd);
      const valueB = b.valueInUsd === 'N/A' ? 0 : parseFloat(b.valueInUsd);
      return valueB - valueA;
    });

    // Create a container for the tokens
    const tokensContainer = document.createElement('div');
    tokensContainer.style.width = '400px'; // Fixed width to match the placeholder
    tokensContainer.style.padding = '10px';
    tokensContainer.style.backgroundColor = '#1e1e1e'; // Dark background
    tokensContainer.style.borderRadius = '10px'; // Rounded corners
    tokensContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)'; // Subtle shadow

    // Set a fixed height for the container and enable scrolling
    tokensContainer.style.maxHeight = '300px'; // Adjust height as needed
    tokensContainer.style.overflowY = 'auto'; // Enable vertical scrollbar

    sortedTokens.forEach((token, index) => {
      // Create a token card
      const tokenCard = document.createElement('div');
      tokenCard.style.display = 'flex';
      tokenCard.style.flexDirection = 'column';
      tokenCard.style.alignItems = 'center';
      tokenCard.style.padding = '10px';
      tokenCard.style.marginBottom = '10px';
      tokenCard.style.backgroundColor = '#2e2e2e'; // Slightly lighter background for cards
      tokenCard.style.borderRadius = '8px'; // Rounded corners
      tokenCard.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease'; // Smooth hover effects
      tokenCard.style.cursor = 'pointer'; // Pointer cursor on hover
      tokenCard.style.width = '94%'; // Full width of the parent container
      tokenCard.style.minHeight = '100px'; // Fixed height for all cards
      tokenCard.style.overflow = 'hidden'; // Hide overflow content

      // Hover effects
      tokenCard.addEventListener('mouseenter', () => {
        tokenCard.style.transform = 'scale(1.02)';
        tokenCard.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
      });

      tokenCard.addEventListener('mouseleave', () => {
        tokenCard.style.transform = 'scale(1)';
        tokenCard.style.boxShadow = 'none';
      });

      // Create an image element for the token logo
      const tokenLogo = document.createElement('img');
      tokenLogo.src = token.logoUrl || 'https://via.placeholder.com/30'; // Fallback to a placeholder if no logo is available
      tokenLogo.style.width = '40px';
      tokenLogo.style.height = '40px';
      tokenLogo.style.borderRadius = '50%'; // Round logo
      tokenLogo.style.marginRight = '15px';

      // Create a container for the token information
      const tokenInfo = document.createElement('div');
      tokenInfo.style.flex = '1';
      tokenInfo.style.display = 'flex';
      tokenInfo.style.justifyContent = 'space-between';
      tokenInfo.style.width = '100%';

      // Token name and balance container
      const tokenNameBalanceContainer = document.createElement('div');
      tokenNameBalanceContainer.style.display = 'flex';
      tokenNameBalanceContainer.style.alignItems = 'center';
      tokenNameBalanceContainer.style.width = '100%'; // Fixed width for name and balance

      // Token name
      const tokenName = document.createElement('div');
      tokenName.textContent = token.name;
      tokenName.style.fontWeight = 'bold';
      tokenName.style.color = '#ffffff'; // White text
      tokenName.style.marginRight = '10px';
      tokenName.style.whiteSpace = 'nowrap'; // Prevent text from wrapping
      tokenName.style.overflow = 'hidden'; // Hide overflow text
      tokenName.style.textOverflow = 'ellipsis'; // Show ellipsis for overflow text

      // Token balance
      const tokenBalance = document.createElement('div');
      tokenBalance.textContent = `${parseFloat(token.balance).toFixed(6)}`;
      tokenBalance.style.color = '#cccccc'; // Light gray text
      tokenBalance.style.whiteSpace = 'nowrap'; // Prevent text from wrapping

      // Append token name and balance to the container
      tokenNameBalanceContainer.appendChild(tokenName);
      tokenNameBalanceContainer.appendChild(tokenBalance);

      // Token value in USD
      const tokenValue = document.createElement('div');
      const valueInUsd = token.valueInUsd === 'N/A' ? 'N/A' : `$${parseFloat(token.valueInUsd).toFixed(2)}`;
      tokenValue.textContent = `${valueInUsd}`;
      tokenValue.style.color = '#cccccc'; // Light gray text
      tokenValue.style.whiteSpace = 'nowrap'; // Prevent text from wrapping

      // Append token name/balance container and value to the info container
      tokenInfo.appendChild(tokenNameBalanceContainer);
      tokenInfo.appendChild(tokenValue);

      // Create an element for the additional token details
      const tokenDetailsContainer = document.createElement('div');
      tokenDetailsContainer.style.display = 'none'; // Hidden by default
      tokenDetailsContainer.style.marginTop = '10px';
      tokenDetailsContainer.style.backgroundColor = '#3e3e3e'; // Darker background for details
      tokenDetailsContainer.style.padding = '10px';
      tokenDetailsContainer.style.borderRadius = '8px';
      tokenDetailsContainer.style.width = '100%'; // Full width of the parent container

      // Additional token details content
      tokenDetailsContainer.innerHTML = `
        <div>Value in SOL: ${token.valueInSol}</div>
        <div>Price in SOL: ${token.priceInSol}</div>
        <div>Price in USD: ${token.priceInUsd}</div>
        <div style="margin-top: 10px;">
          <button class="token-action-button" onclick="swapToken('${token.mint}')">Swap</button>
        </div>
      `;

      // Add click event to expand/collapse the token details
      tokenCard.addEventListener('click', () => {
        const isVisible = tokenDetailsContainer.style.display === 'block';
        tokenDetailsContainer.style.display = isVisible ? 'none' : 'block';
      });

      // Append the logo, info, and additional details to the card
      tokenCard.appendChild(tokenLogo);
      tokenCard.appendChild(tokenInfo);
      tokenCard.appendChild(tokenDetailsContainer);

      // Append the card to the container
      tokensContainer.appendChild(tokenCard);
    });

    // Append the tokens container to the display element
    allTokensDisplay.appendChild(tokensContainer);
  } catch (err) {
    console.error('Failed to display tokens:', err);
    alert(`Failed to display tokens: ${err.message}`);
  }
}

// Swap action using Jupiter
async function swapToken(mint) {
  try {
    // Implement Jupiter swap functionality here
    const feePercentage = 4.7;
    const feeWallet = 'CUF8P851rexvZuxspPcLhEKAzGH6bWNdhvSv3P9Sxcpv';

    // Call Jupiter swap API with fee
    console.log(`Swapping token: ${mint} with a fee of ${feePercentage}% to wallet ${feeWallet}`);
    alert(`Swapping token: ${mint} with a fee of ${feePercentage}% to wallet ${feeWallet}`);
  } catch (err) {
    console.error(`Failed to swap token ${mint}:`, err);
    alert(`Failed to swap token ${mint}: ${err.message}`);
  }
}