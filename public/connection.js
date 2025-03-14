document.addEventListener('DOMContentLoaded', function () {
  const connectWalletButton = document.getElementById('connect-wallet-button');
  const walletButtons = document.getElementById('wallet-buttons');
  const phantomButton = document.getElementById('phantom-button');
  const backpackButton = document.getElementById('backpack-button');
  const solflareButton = document.getElementById('solflare-button');
  const magicedenButton = document.getElementById('magiceden-button');
  const coinbaseButton = document.getElementById('coinbase-button');
  const walletAddress = document.getElementById('wallet-address');
  let connectedWallet;

  // WebSocket connection setup
  const socket = io();

  // Show wallet options when Connect Wallet button is clicked
  connectWalletButton.addEventListener('click', () => {
    if (connectWalletButton.textContent === 'Connect Wallet') {
      walletButtons.style.display = 'block';
    } else {
      disconnectWallet();
    }
  });

  // Connect Wallet
  async function connectWallet(walletProvider) {
    try {
      if (!walletProvider) {
        alert('Wallet not installed. Please install it.');
        return;
      }

      await walletProvider.connect();
      connectedWallet = walletProvider;

      if (!walletProvider.publicKey) {
        throw new Error('Failed to retrieve publicKey from wallet');
      }

      walletAddress.textContent = `Connected wallet: ${walletProvider.publicKey.toString()}`;
      walletButtons.style.display = 'none';
      connectWalletButton.textContent = 'Disconnect Wallet';
      console.log('Wallet connected:', walletProvider.publicKey.toString());

      // Notify the server about the wallet connection
      if (socket.connected) {
        socket.emit('wallet_connected', {
          wallet: walletProvider.publicKey.toString()
        });
      }
      window.connectedWallet = walletProvider.publicKey.toString();
    } catch (err) {
      console.error('Failed to connect wallet:', err);
      alert(`Failed to connect wallet: ${err.message}`);
      walletAddress.textContent = 'Failed to connect wallet. Please try again.';
    }
  }

  // Detect Wallet
  function detectWallet(walletName) {
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

  // Event Listeners for Wallet Buttons
  phantomButton.addEventListener('click', () => connectWallet(detectWallet('phantom')));
  backpackButton.addEventListener('click', () => connectWallet(detectWallet('backpack')));
  solflareButton.addEventListener('click', () => connectWallet(detectWallet('solflare')));
  magicedenButton.addEventListener('click', () => connectWallet(detectWallet('magiceden')));
  coinbaseButton.addEventListener('click', () => connectWallet(detectWallet('coinbase')));

  // Disconnect Wallet
  async function disconnectWallet() {
    if (connectedWallet) {
      try {
        await connectedWallet.disconnect();
        connectedWallet = null;
        walletAddress.textContent = 'Wallet disconnected';
        connectWalletButton.textContent = 'Connect Wallet';
        console.log('Wallet disconnected');
      } catch (err) {
        console.error('Failed to disconnect wallet:', err);
        alert(`Failed to disconnect wallet: ${err.message}`);
        walletAddress.textContent = 'Failed to disconnect wallet. Please try again.';
      }
    }
  }

  // Expose the connected wallet and disconnect function to the global scope
  window.connectedWallet = connectedWallet;
  window.disconnectWallet = disconnectWallet;
});