document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('search-btn');
  const mainHeadline = document.getElementById('main-headline');
  const addFriendsBtn = document.getElementById('add-friends-btn');
  const resultsSection = document.getElementById('results-section');
  const chatHistory = document.getElementById('chat-history');
  const flightCards = document.querySelectorAll('.light-flight-card');
  const filtersBar = document.querySelector('.filters-bar');
  const resultsMain = document.querySelector('.results-main');

  searchBtn.addEventListener('click', () => {
    // Hide original elements
    mainHeadline.style.display = 'none';
    if(addFriendsBtn) addFriendsBtn.style.display = 'none';
    
    // Change background to solid white
    document.body.classList.add('white-bg');

    // Show results section container
    resultsSection.style.display = 'flex';
    resultsSection.style.animation = 'fadeInDown 0.5s ease-out';

    // Hide cards and filters initially
    filtersBar.style.display = 'none';
    flightCards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
    });

    // Create and show loader
    const loaderContainer = document.createElement('div');
    loaderContainer.className = 'loader-container';
    loaderContainer.innerHTML = '<div class="spinner"></div><div>Searching for the best flights...</div>';
    resultsMain.insertBefore(loaderContainer, filtersBar);

    // Simulate search delay
    setTimeout(() => {
      // Remove loader
      loaderContainer.remove();

      // Show filters
      filtersBar.style.display = 'flex';

      // Staggered reveal of flight cards
      flightCards.forEach((card, index) => {
        setTimeout(() => {
          card.style.opacity = '1';
          card.style.transform = 'translateY(0)';
        }, index * 200); // 200ms delay between each card
      });

      // Start AI sequence after cards are revealed
      setTimeout(startAiSequence, flightCards.length * 200 + 300);

    }, 2000); // 2 second search simulation
  });

  function startAiSequence() {
    chatHistory.innerHTML = ''; // Clear in case of multiple clicks
    
    setTimeout(() => {
      appendAiMessage("I found 160 flights for you. I've pinned the best Turkish Airlines option at the top.");
      
      setTimeout(() => {
        appendAiMessage("Would you like me to filter out layovers over 20 hours, or show you alternative airlines?");
        appendInteractiveChips([
          { label: "Shorter layovers", id: "shorter" },
          { label: "Other airlines", id: "airlines" }
        ]);
      }, 1500);

    }, 800);
  }

  function appendAiMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ai-message-light';
    msgDiv.innerText = text;
    chatHistory.appendChild(msgDiv);
    scrollToBottom();
  }

  function appendUserMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message user-message-light';
    msgDiv.innerText = text;
    chatHistory.appendChild(msgDiv);
    scrollToBottom();
  }

  function appendInteractiveChips(chips) {
    const chipContainer = document.createElement('div');
    chipContainer.className = 'chip-container';

    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn-light';
      btn.innerText = chip.label;
      btn.onclick = () => handleChipClick(chip, chipContainer);
      chipContainer.appendChild(btn);
    });

    chatHistory.appendChild(chipContainer);
    scrollToBottom();
  }

  function handleChipClick(chip, container) {
    const buttons = container.querySelectorAll('.chip-btn-light');
    buttons.forEach(b => {
      if (b.innerText === chip.label) {
        b.classList.add('active');
      } else {
        b.classList.add('disabled');
        b.onclick = null;
      }
    });

    appendUserMessage(chip.label);

    setTimeout(() => {
      appendAiMessage("Filtering the grid now. Let me know if you want to book the top option.");
    }, 1000);
  }

  function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
});
