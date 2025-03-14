const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=699ef9de-bf92-4146-942e-25233ae349ce`;

export async function getBalance(publicKey) {
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
}export async function displayTokens(publicKey, tokenDetails) {
  try {
    const walletContainer = document.querySelector('.wallet-container');
    const allTokensDisplay = document.createElement('div');
    allTokensDisplay.id = 'all-tokens-display';
    allTokensDisplay.style.width = '270px';

    // Updated styles to match website theme
    allTokensDisplay.style.padding = '10px';
    allTokensDisplay.style.backgroundColor = 'rgba(44, 62, 80, 0.9)'; // Match website theme
    allTokensDisplay.style.borderRadius = '10px';
    allTokensDisplay.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
    allTokensDisplay.style.position = 'fixed';
    allTokensDisplay.style.top = '20px';
    allTokensDisplay.style.left = '20px';
    allTokensDisplay.style.cursor = 'grab';
    allTokensDisplay.style.zIndex = '1000';
    allTokensDisplay.style.transition = 'all 0.3s ease';
    allTokensDisplay.style.border = '1px solid rgba(255, 255, 255, 0.1)';


    const existingTokensDisplay = document.getElementById('all-tokens-display');
    if (existingTokensDisplay) {
      existingTokensDisplay.remove();
    }

    const sortedTokens = tokenDetails.sort((a, b) => {
      const valueA = a.valueInUsd === 'N/A' ? 0 : parseFloat(a.valueInUsd);
      const valueB = b.valueInUsd === 'N/A' ? 0 : parseFloat(b.valueInUsd);
      return valueB - valueA;
    });

    const tokensContainer = document.createElement('div');
    tokensContainer.style.width = '100%';
    tokensContainer.style.padding = '10px';
    tokensContainer.style.backgroundColor = 'transparent';
    tokensContainer.style.borderRadius = '10px';
    tokensContainer.style.maxHeight = '400px';
    tokensContainer.style.overflowY = 'scroll';
    tokensContainer.style.msOverflowStyle = 'none'; // Hide scrollbar in IE
    tokensContainer.style.scrollbarWidth = 'none'; // Hide scrollbar in Firefox

    // Hide scrollbar but keep functionality
    tokensContainer.style.cssText += `
      scrollbar-width: none;
      -ms-overflow-style: none;
      &::-webkit-scrollbar {
        display: none;
      }
    `;

    sortedTokens.forEach((token) => {
      const tokenCard = document.createElement('div');
      tokenCard.style.display = 'flex';
      tokenCard.style.flexDirection = 'column';
      tokenCard.style.alignItems = 'center';
      tokenCard.style.padding = '10px';
      tokenCard.style.marginBottom = '10px';
      tokenCard.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      tokenCard.style.borderRadius = '8px';
      tokenCard.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
      tokenCard.style.cursor = 'pointer';
      tokenCard.style.width = '88%';
      tokenCard.style.minHeight = '100px';
      tokenCard.style.overflow = 'hidden';
      tokenCard.style.border = '1px solid rgba(255, 255, 255, 0.05)';

      tokenCard.addEventListener('mouseenter', () => {
        tokenCard.style.transform = 'scale(1.02)';
        tokenCard.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
        tokenCard.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
      });

      tokenCard.addEventListener('mouseleave', () => {
        tokenCard.style.transform = 'scale(1)';
        tokenCard.style.boxShadow = 'none';
        tokenCard.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
      });

      const tokenLogo = document.createElement('img');
      tokenLogo.src = token.logoUrl || 'https://via.placeholder.com/30';
      tokenLogo.style.width = '40px';
      tokenLogo.style.height = '40px';
      tokenLogo.style.borderRadius = '50%';
      tokenLogo.style.marginRight = '15px';

      const tokenInfo = document.createElement('div');
      tokenInfo.style.flex = '1';
      tokenInfo.style.display = 'flex';
      tokenInfo.style.justifyContent = 'space-between';
      tokenInfo.style.width = '94%';

      const tokenNameBalanceContainer = document.createElement('div');
      tokenNameBalanceContainer.style.display = 'flex';
      tokenNameBalanceContainer.style.alignItems = 'center';
      tokenNameBalanceContainer.style.width = '100%';

      const tokenName = document.createElement('div');
      tokenName.textContent = token.name;
      tokenName.style.fontWeight = 'bold';
      tokenName.style.color = '#21ffcc'; // PumpFun green
      tokenName.style.marginRight = '10px';
      tokenName.style.whiteSpace = 'nowrap';
      tokenName.style.overflow = 'hidden';
      tokenName.style.textOverflow = 'ellipsis';

      const tokenBalance = document.createElement('div');
      tokenBalance.textContent = `${parseFloat(token.balance).toFixed(6)}`;
      tokenBalance.style.color = '#fff';
      tokenBalance.style.whiteSpace = 'nowrap';

      tokenNameBalanceContainer.appendChild(tokenName);
      tokenNameBalanceContainer.appendChild(tokenBalance);

      const tokenValue = document.createElement('div');
      const valueInUsd = token.valueInUsd === 'N/A' ? 'N/A' : `$${parseFloat(token.valueInUsd).toFixed(2)}`;
      tokenValue.textContent = `${valueInUsd}`;
      tokenValue.style.color = '#ff1f21'; // PumpFun red
      tokenValue.style.whiteSpace = 'nowrap';

      tokenInfo.appendChild(tokenNameBalanceContainer);
      tokenInfo.appendChild(tokenValue);

      const tokenDetailsContainer = document.createElement('div');
      tokenDetailsContainer.style.display = 'none';
      tokenDetailsContainer.style.marginTop = '10px';
      tokenDetailsContainer.style.backgroundColor = 'rgba(44, 62, 80, 0.95)';
      tokenDetailsContainer.style.padding = '10px';
      tokenDetailsContainer.style.borderRadius = '8px';
      tokenDetailsContainer.style.width = '100%';
      tokenDetailsContainer.style.border = '1px solid rgba(255, 255, 255, 0.05)';

      tokenDetailsContainer.innerHTML = `
        <div style="color: #fff; margin: 5px 0;">Value in SOL: ${token.valueInSol}</div>
        <div style="color: #fff; margin: 5px 0;">Price in SOL: ${token.priceInSol}</div>
        <div style="color: #fff; margin: 5px 0;">Price in USD: ${token.priceInUsd}</div>
        <div style="margin-top: 10px;">
          <button class="token-action-button" onclick="swapToken('${token.mint}')"
            style="
              background: linear-gradient(45deg, #ff1f21, #ff4444);
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 5px;
              cursor: pointer;

              font-size: 14px;
              transition: all 0.3s ease;
            "
            onmouseover="this.style.background = 'linear-gradient(45deg, #ff4444, #ff1f21)'"
            onmouseout="this.style.background = 'linear-gradient(45deg, #ff1f21, #ff4444)'"
          >Swap</button>
        </div>
      `;

      tokenCard.addEventListener('click', () => {
        const isVisible = tokenDetailsContainer.style.display === 'block';
        tokenDetailsContainer.style.display = isVisible ? 'none' : 'block';
      });

      tokenCard.appendChild(tokenLogo);
      tokenCard.appendChild(tokenInfo);
      tokenCard.appendChild(tokenDetailsContainer);
      tokensContainer.appendChild(tokenCard);
    });

    allTokensDisplay.appendChild(tokensContainer);

    const minimizeButton = document.createElement('button');
    minimizeButton.textContent = '−';
    minimizeButton.style.position = 'absolute';
    minimizeButton.style.top = '5px';
    minimizeButton.style.right = '5px';
    minimizeButton.style.backgroundColor = '#ff1f21';
    minimizeButton.style.color = '#fff';
    minimizeButton.style.border = 'none';
    minimizeButton.style.borderRadius = '50%';
    minimizeButton.style.width = '20px';
    minimizeButton.style.height = '20px';
    minimizeButton.style.cursor = 'pointer';
    minimizeButton.style.display = 'flex';
    minimizeButton.style.alignItems = 'center';
    minimizeButton.style.justifyContent = 'center';
    minimizeButton.style.fontSize = '16px';
    minimizeButton.style.lineHeight = '1';
    minimizeButton.style.transition = 'background 0.3s ease';

    minimizeButton.addEventListener('mouseenter', () => {
      minimizeButton.style.backgroundColor = '#ff4444';
    });

    minimizeButton.addEventListener('mouseleave', () => {
      minimizeButton.style.backgroundColor = '#ff1f21';
    });

    let isMinimized = false;
    minimizeButton.addEventListener('click', () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        allTokensDisplay.style.height = '2px';
        allTokensDisplay.style.overflow = 'hidden';
        minimizeButton.textContent = '+';
      } else {
        allTokensDisplay.style.height = 'auto';
        allTokensDisplay.style.overflow = 'visible';
        allTokensDisplay.style.backgroundColor = 'rgba(44, 62, 80, 0.9)';
        minimizeButton.textContent = '−';
      }
    });

    allTokensDisplay.appendChild(minimizeButton);
    walletContainer.appendChild(allTokensDisplay);
    makeDraggable(allTokensDisplay);
  } catch (err) {
    console.error('Failed to display tokens:', err);
    alert(`Failed to display tokens: ${err.message}`);
  }
}
// Function to make an element draggable
function makeDraggable(element) {
  let isDragging = false;
  let offsetX, offsetY;

  // Add a CSS class to disable text selection
  const disableTextSelection = () => {
    document.body.classList.add('no-select');
  };

  // Remove the CSS class to re-enable text selection
  const enableTextSelection = () => {
    document.body.classList.remove('no-select');
  };

  element.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - element.getBoundingClientRect().left;
    offsetY = e.clientY - element.getBoundingClientRect().top;
    element.style.cursor = 'grabbing'; // Change cursor to grabbing
    disableTextSelection(); // Disable text selection during drag
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    element.style.cursor = 'grab'; // Change cursor back to grab
    enableTextSelection(); // Re-enable text selection after drag
  });
}
// Swap, buy, and sell actions using Jupiter
async function swapToken(mint) {
  try {
    // Construct Jupiter swap URL with the token mint account
    const jupiterSwapUrl = `https://jup.ag/swap/${mint}-3FbAHro2tuCqrxADiw55DZXpZtqN84VdAWaRAb63pump`;
    
    // Redirect to the Jupiter swap URL
    window.open(jupiterSwapUrl, '_blank');
    
    console.log(`Redirecting to Jupiter swap URL: ${jupiterSwapUrl}`);
  } catch (err) {
    console.error(`Failed to swap token ${mint}:`, err);
  }
}

async function buyToken(mint) {
  try {
    // Implement Jupiter buy functionality here
    const feePercentage = 4.7;
    const feeWallet = 'CUF8P851rexvZuxspPcLhEKAzGH6bWNdhvSv3P9Sxcpv';

    // Call Jupiter buy API with fee
    console.log(`Buying token: ${mint} with a fee of ${feePercentage}% to wallet ${feeWallet}`);
  } catch (err) {
    console.error(`Failed to buy token ${mint}:`, err);
  }
}

async function sellToken(mint) {
  try {
    // Implement Jupiter sell functionality here
    const feePercentage = 4.7;
    const feeWallet = 'CUF8P851rexvZuxspPcLhEKAzGH6bWNdhvSv3P9Sxcpv';

    // Call Jupiter sell API with fee
    console.log(`Selling token: ${mint} with a fee of ${feePercentage}% to wallet ${feeWallet}`);
  } catch (err) {
    console.error(`Failed to sell token ${mint}:`, err);
  }
}