const HELIUS_RPC_URL = `https://api.mainnet-beta.solana.com`;
const SOLANA_RPC_URL = `https://api.mainnet-beta.solana.com`;

export async function connectWallet(walletProvider, socket) {
  try {
    if (!walletProvider) {
      alert('Wallet not installed. Please install it.');
      return;
    }

    // Connect to the wallet
    await walletProvider.connect();
    const connectedWallet = walletProvider;

    // Ensure the wallet has a public key
    if (!walletProvider.publicKey) {
      throw new Error('Failed to retrieve publicKey from wallet');
    }

    // Get the wallet address as a string
    const walletAddressString = walletProvider.publicKey.toString();

    // Fetch the latest user data from users.json
    const response = await fetch('/api/users', { cache: 'no-store' }); // Ensure no caching
    if (!response.ok) {
      throw new Error(`Failed to fetch users: ${response.status}`);
    }
    const users = await response.json();
    const user = users[walletAddressString];

    // Update the UI with the latest user data
    const walletAddressElement = document.getElementById('wallet-address');
    if (walletAddressElement) {
      if (user) {
        walletAddressElement.textContent = `Wallet connected (Nickname: ${user.nickname})`;
        walletAddressElement.dataset.walletAddress = walletAddressString; // Store wallet address in data attribute
      } else {
        walletAddressElement.textContent = `Wallet connected (Nickname: Not set)`;
        walletAddressElement.dataset.walletAddress = walletAddressString; // Store wallet address in data attribute
      }
    }

    // Notify the server about the wallet connection
    socket.emit('wallet_connected', { wallet: walletAddressString });

    // Emit an event to save user data (if needed)
    socket.emit('save_user_data', { wallet: walletAddressString });

    console.log('Wallet connected:', walletAddressString);
    return connectedWallet;
  } catch (err) {
    console.error('Failed to connect wallet:', err);
    alert(`Failed to connect wallet: ${err.message}`);

    // Update the UI to show the error
    const walletAddressElement = document.getElementById('wallet-address');
    if (walletAddressElement) {
      walletAddressElement.textContent = 'Failed to connect wallet. Please try again.';
    }
	   // Update the nickname in users.json
      const updateResponse = await fetch('/api/users/update-nickname', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet: walletAddress,
          nickname: user.nickname,
        }),
      });
  }
  
}
export async function disconnectWallet(connectedWallet, socket) {
    // Refresh the page after 3 seconds
    if (connectedWallet) {
        try {
            await connectedWallet.disconnect();

            // Terminate the WebSocket connection
            if (socket && socket.connected) {
                socket.disconnect();
                console.log('WebSocket connection terminated.');
            }

            // Clear the cached nickname
            localStorage.removeItem('cachedNickname');

            // Update UI elements
            document.getElementById('wallet-address').textContent = 'Wallet disconnected';
            document.getElementById('wallet-balance').textContent = '';
            document.getElementById('all-tokens-display').textContent = '';
            document.getElementById('transaction-result').textContent = '';
            document.getElementById('connect-wallet-button').textContent = 'Connect Wallet';

            // Hide the wallet buttons
            document.getElementById('wallet-buttons').style.display = 'none';

            // Hide the edit-nickname-button and fetch-tokens-button
            document.getElementById('edit-nickname-button').style.display = 'none';
            document.getElementById('fetch-tokens-button').style.display = 'none';

            console.log('Wallet disconnected');

            // Notify the server about the wallet disconnection
            socket.emit('wallet_disconnected');

            // Re-establish a new WebSocket connection
            socket.connect();
            console.log('New WebSocket connection established.');
        } catch (err) {
            console.error('Failed to disconnect wallet:', err);
    
            document.getElementById('wallet-address').textContent = 'Failed to disconnect wallet. Please try again.';
        }
    }
}

export function detectWallet(walletName) {
  switch (walletName) {
    case 'phantom':
      return window.solana?.isPhantom ? window.solana : null;
    case 'backpack':
      return window.backpack?.isBackpack ? window.backpack : null;
    case 'solflare':
      return window.solflare?.isSolflare ? window.solflare : null;
    case 'magiceden':
      return window.magicEden?.solana ? window.magicEden.solana : null;
    case 'coinbase':
      return window.coinbaseSolana ? window.coinbaseSolana : null;
    default:
      return null;
  }
}