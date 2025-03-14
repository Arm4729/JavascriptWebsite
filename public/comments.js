document.addEventListener('DOMContentLoaded', () => {
    const commentForm = document.getElementById('comment-form');
    const commentInput = document.getElementById('comment-input');
    const submitCommentButton = document.getElementById('submit-comment-button');
    const commentsList = document.getElementById('comments-list');
    const walletAddressElement = document.getElementById('wallet-address');
    const nicknameElement = document.getElementById('nickname-input');

    // Add sorting buttons with arrow icons
    const sortButtons = document.createElement('div');
    sortButtons.id = 'sort-buttons';
    sortButtons.innerHTML = `
        <button id="sort-newest" title="Newest First">▲</button>
        <button id="sort-oldest" title="Oldest First">▼</button>
    `;
    commentForm.insertAdjacentElement('beforebegin', sortButtons);

    // Add "Load More" button
    const loadMoreButton = document.createElement('button');
    loadMoreButton.id = 'load-more-button';
    loadMoreButton.textContent = 'Load More';
    loadMoreButton.style.display = 'none'; // Initially hidden
    commentsList.insertAdjacentElement('afterend', loadMoreButton);

    let allComments = []; // Stores all comments from the server
    let renderedCommentsCount = 0; // Tracks the number of rendered comments
    const commentsPerPage = 30; // Number of comments to render per batch

    // Function to fetch nickname from users.json
    const fetchNickname = async (wallet) => {
        try {
            const response = await fetch('/api/users'); // Ensure this endpoint returns the users.json data
            const users = await response.json();
            return users[wallet] ? users[wallet].nickname : 'Anonymous'; // Fetch nickname from users.json
        } catch (error) {
            console.error('Error fetching nickname:', error);
            return 'Anonymous';
        }
    };

    // Show comment form if wallet is connected
    const updateWalletAndNickname = () => {
        const walletAddress = walletAddressElement ? walletAddressElement.dataset.walletAddress : null;
        const nickname = nicknameElement ? nicknameElement.value.trim() : 'Anonymous';

        if (walletAddress) {
            commentForm.style.display = 'block'; // Show the comment form if wallet is connected
        } else {
            commentForm.style.display = 'none'; // Hide the comment form if wallet is not connected
        }
    };

    // Initial check for wallet connection
    updateWalletAndNickname();

    // Listen for changes in the wallet address or nickname
    if (walletAddressElement) {
        new MutationObserver(updateWalletAndNickname).observe(walletAddressElement, {
            attributes: true, // Watch for attribute changes (e.g., data-wallet-address)
        });
    }

    if (nicknameElement) {
        nicknameElement.addEventListener('input', updateWalletAndNickname);
    }

    // Function to render a single comment
    const renderComment = async (comment) => {
        const commentElement = document.createElement('div');
        commentElement.className = 'comment';
        commentElement.setAttribute('data-timestamp', comment.timestamp); // Add timestamp for sorting

        const nickname = await fetchNickname(comment.wallet);

        commentElement.innerHTML = `
            <div class="comment-header">
                <span class="nickname">${nickname}</span>
                <span class="wallet">${comment.wallet.slice(0, 7)}</span>
                <span class="timestamp">${new Date(comment.timestamp).toLocaleString()}</span>
            </div>
            <div class="comment-content">${comment.text}</div>
            <div class="comment-actions">
                <button class="like-button">
                    <span class="like-icon">👍</span>
                    <span class="like-count">${comment.likes}</span>
                </button>
                <button class="reply-button">
                    <span class="reply-icon">💬</span>
                    Reply
                </button>
            </div>
        `;

        // Handle like button
        const likeButton = commentElement.querySelector('.like-button');
        likeButton.addEventListener('click', () => {
            const walletAddress = walletAddressElement ? walletAddressElement.dataset.walletAddress : null;
            if (!walletAddress) {
                alert('Please connect your wallet to like comments.');
                return;
            }
            socket.emit('like_comment', { commentId: comment.timestamp, wallet: walletAddress });
        });

        // Handle reply button (toggle reply form visibility)
        const replyButton = commentElement.querySelector('.reply-button');
        replyButton.addEventListener('click', () => {
            const walletAddress = walletAddressElement ? walletAddressElement.dataset.walletAddress : null;
            if (!walletAddress) {
                alert('Please connect your wallet to reply to comments.');
                return;
            }

            const replyForm = commentElement.querySelector('.reply-form');
            if (replyForm) {
                // If the reply form is already visible, hide it
                replyForm.remove();
            } else {
                // If the reply form is not visible, show it
                const replyForm = document.createElement('div');
                replyForm.className = 'reply-form';
                replyForm.innerHTML = `
                    <textarea class="reply-input" placeholder="Write your reply..."></textarea>
                    <button class="submit-reply-button">Submit Reply</button>
                `;
                commentElement.appendChild(replyForm);

                // Handle reply submission
                const submitReplyButton = replyForm.querySelector('.submit-reply-button');
                submitReplyButton.addEventListener('click', () => {
                    const replyInput = replyForm.querySelector('.reply-input');
                    const replyText = replyInput.value.trim();
                    if (!replyText) {
                        alert('Please enter a reply.');
                        return;
                    }

                    const walletAddress = walletAddressElement ? walletAddressElement.dataset.walletAddress : null;
                    const nickname = nicknameElement ? nicknameElement.value.trim() : 'Anonymous';

                    const reply = {
                        wallet: walletAddress,
                        nickname: nickname,
                        text: replyText,
                        timestamp: new Date().toISOString()
                    };

                    socket.emit('new_reply', { commentId: comment.timestamp, reply });
                    replyInput.value = '';
                    replyForm.remove(); // Hide the reply form after submission
                });
            }
        });

        // Render replies if they exist
        if (comment.replies && comment.replies.length > 0) {
            const repliesContainer = document.createElement('div');
            repliesContainer.className = 'replies';
            for (const reply of comment.replies) {
                const replyNickname = reply.wallet ? await fetchNickname(reply.wallet) : reply.nickname || 'Anonymous';
                const replyElement = document.createElement('div');
                replyElement.className = 'reply';
                replyElement.innerHTML = `
                    <div class="reply-header">
                        <span class="nickname">${replyNickname}</span>
                        ${reply.wallet ? `<span class="wallet">${reply.wallet.slice(0, 7)}</span>` : ''}
                        <span class="timestamp">${new Date(reply.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="reply-content">${reply.text}</div>
                `;
                repliesContainer.appendChild(replyElement);
            }
            commentElement.appendChild(repliesContainer);
        }

        return commentElement;
    };

    // Function to sort comments by timestamp (newest first by default)
    const sortComments = (comments, order = 'desc') => {
        return comments.sort((a, b) => {
            const timeA = new Date(a.timestamp);
            const timeB = new Date(b.timestamp);
            return order === 'desc' ? timeB - timeA : timeA - timeB;
        });
    };

    // Function to render a batch of comments
    const renderCommentsBatch = async (comments, startIndex, batchSize = 30) => {
        const endIndex = startIndex + batchSize;
        const commentsToRender = comments.slice(startIndex, endIndex);

        for (const comment of commentsToRender) {
            const commentElement = await renderComment(comment);
            commentsList.appendChild(commentElement);
            commentElement.classList.add('glowing-shaking'); // Add glowing shaking effect
            setTimeout(() => {
                commentElement.classList.remove('glowing-shaking');
            }, 1000); // Remove the effect after 1 second
        }

        renderedCommentsCount += commentsToRender.length;

        // Show or hide the "Load More" button
        if (renderedCommentsCount < comments.length) {
            loadMoreButton.style.display = 'block';
        } else {
            loadMoreButton.style.display = 'none';
        }
    };

    // Handle initial load of comments
    socket.on('load_initial_state', async (data) => {
        const { comments } = data;
        allComments = sortComments(comments, 'desc'); // Sort by newest first
        renderedCommentsCount = 0; // Reset rendered comments count
        commentsList.innerHTML = ''; // Clear existing comments

        // Render the first batch of comments
        renderCommentsBatch(allComments, 0);
    });

    // Handle "Load More" button click
    loadMoreButton.addEventListener('click', () => {
        renderCommentsBatch(allComments, renderedCommentsCount);
    });

    // Handle new comment from server
    socket.on('new_comment', async (comment) => {
        allComments.unshift(comment); // Add new comment to the beginning of the array
        allComments = sortComments(allComments, 'desc'); // Sort comments by newest first
        renderedCommentsCount = 0; // Reset rendered comments count
        commentsList.innerHTML = ''; // Clear existing comments
        renderCommentsBatch(allComments, 0); // Re-render comments
    });

    // Handle comment liked
    socket.on('comment_liked', (data) => {
        const commentElement = document.querySelector(`.comment[data-timestamp="${data.commentId}"]`);
        if (commentElement) {
            const likeButton = commentElement.querySelector('.like-button');
            const likeCount = commentElement.querySelector('.like-count');
            likeCount.textContent = data.likes; // Update the like count
        }
    });

    // Handle new reply
    socket.on('new_reply', async (data) => {
        const commentElement = document.querySelector(`.comment[data-timestamp="${data.commentId}"]`);
        if (commentElement) {
            const repliesContainer = commentElement.querySelector('.replies') || document.createElement('div');
            repliesContainer.className = 'replies';

            const replyNickname = data.reply.wallet ? await fetchNickname(data.reply.wallet) : data.reply.nickname || 'Anonymous';
            const replyElement = document.createElement('div');
            replyElement.className = 'reply';
            replyElement.innerHTML = `
                <div class="reply-header">
                    <span class="nickname">${replyNickname}</span>
                    ${data.reply.wallet ? `<span class="wallet">${data.reply.wallet.slice(0, 7)}</span>` : ''}
                    <span class="timestamp">${new Date(data.reply.timestamp).toLocaleString()}</span>
                </div>
                <div class="reply-content">${data.reply.text}</div>
            `;
            repliesContainer.appendChild(replyElement);
            commentElement.appendChild(repliesContainer);

            // Add glowing shaking effect to the new reply
            replyElement.classList.add('glowing-shaking');
            setTimeout(() => {
                replyElement.classList.remove('glowing-shaking');
            }, 1000); // Remove the effect after 1 second
        }
    });

    // Handle comment submission
    submitCommentButton.addEventListener('click', () => {
        const commentText = commentInput.value.trim();
        if (!commentText) {
            alert('Please enter a comment.');
            return;
        }

        // Get wallet address and nickname from the DOM
        const walletAddress = walletAddressElement ? walletAddressElement.dataset.walletAddress : null;
        const nickname = nicknameElement ? nicknameElement.value.trim() : 'Anonymous';

        console.log('Nickname:', nickname); // Debugging: Check the nickname value

        if (!walletAddress) {
            alert('Please connect your wallet to comment.');
            return;
        }

        const comment = {
            wallet: walletAddress,
            nickname: nickname,
            text: commentText,
            timestamp: new Date().toISOString(),
            likes: 0,
            replies: []
        };

        socket.emit('new_comment', comment);
        commentInput.value = '';
    });

    // Sort comments by newest first
    document.getElementById('sort-newest').addEventListener('click', () => {
        allComments = sortComments(allComments, 'desc');
        renderedCommentsCount = 0; // Reset rendered comments count
        commentsList.innerHTML = ''; // Clear existing comments
        renderCommentsBatch(allComments, 0);
    });

    // Sort comments by oldest first
    document.getElementById('sort-oldest').addEventListener('click', () => {
        allComments = sortComments(allComments, 'asc');
        renderedCommentsCount = 0; // Reset rendered comments count
        commentsList.innerHTML = ''; // Clear existing comments
        renderCommentsBatch(allComments, 0);
    });
});