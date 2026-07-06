document.addEventListener('DOMContentLoaded', () => {
  const searchBtn = document.getElementById('search-btn');
  const mainHeadline = document.getElementById('main-headline');
  const addFriendsBtn = document.getElementById('add-friends-btn');
  const resultsSection = document.getElementById('results-section');
  const chatHistory = document.getElementById('chat-history');
  const flightCards = document.querySelectorAll('.light-flight-card');
  const filtersBar = document.querySelector('.filters-bar');
  const resultsMain = document.querySelector('.results-main');

  // Autocomplete Dropdown Logic
  const fromInput = document.getElementById('from-input');
  const fromDropdown = document.getElementById('from-dropdown');
  const toInput = document.getElementById('to-input');
  const toDropdown = document.getElementById('to-dropdown');

  const airportsData = [
    { countryCode: 'GL', title: 'Qaanaaq, Greenland', code: 'NAQ', subtitle: 'Qaanaaq Airport' },
    { countryCode: 'GL', title: 'Qaarsut, Greenland', code: 'JQA', subtitle: 'Qaarsut Airport' },
    { countryCode: 'SA', title: 'Qaisumah, Saudi Arabia', code: 'AQI', subtitle: 'Al Qaisumah/Hafr Al Batin Airport' },
    { countryCode: 'CN', title: 'Bangda, China', code: 'BPX', subtitle: 'Qamdo Bamda Airport' },
    { countryCode: 'GR', title: 'Athens, Greece', code: 'ATH', subtitle: 'Eleftherios Venizelos Airport' },
    { countryCode: 'GR', title: 'Thessaloniki, Greece', code: 'SKG', subtitle: 'Makedonia Airport' },
    { countryCode: 'GR', title: 'Heraklion, Greece', code: 'HER', subtitle: 'Nikos Kazantzakis Airport' },
    { countryCode: 'GL', title: 'Nuuk, Greenland', code: 'GOH', subtitle: 'Nuuk Airport' },
    { countryCode: 'US', title: 'New York, United States', code: 'JFK', subtitle: 'John F. Kennedy International' },
    { countryCode: 'US', title: 'Newark, United States', code: 'EWR', subtitle: 'Newark Liberty International' },
    { countryCode: 'TR', title: 'Istanbul, Turkey', code: 'IST', subtitle: 'Istanbul Airport' }
  ];

  function renderDropdown(query, dropdownElement, inputElement) {
    dropdownElement.innerHTML = '';
    if (!query) {
      dropdownElement.style.display = 'none';
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = airportsData.filter(a => 
      a.title.toLowerCase().includes(lowerQuery) || 
      a.code.toLowerCase().includes(lowerQuery) ||
      a.countryCode.toLowerCase().includes(lowerQuery)
    );

    if (filtered.length === 0) {
      dropdownElement.style.display = 'none';
      return;
    }

    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = 'dropdown-item';
      div.innerHTML = `
        <div class="dropdown-icon">${item.countryCode}</div>
        <div class="dropdown-text">
          <div class="dropdown-title">${item.title} <span class="dropdown-code">(${item.code})</span></div>
          <div class="dropdown-subtitle">${item.subtitle}</div>
        </div>
      `;
      div.addEventListener('click', () => {
        inputElement.value = `${item.title.split(',')[0]} (${item.code})`;
        dropdownElement.style.display = 'none';
      });
      dropdownElement.appendChild(div);
    });

    dropdownElement.style.display = 'block';
  }

  if (fromInput && fromDropdown) {
    fromInput.addEventListener('input', (e) => renderDropdown(e.target.value.trim(), fromDropdown, fromInput));
    fromInput.addEventListener('focus', (e) => renderDropdown(e.target.value.trim(), fromDropdown, fromInput));
  }

  if (toInput && toDropdown) {
    toInput.addEventListener('input', (e) => renderDropdown(e.target.value.trim(), toDropdown, toInput));
    toInput.addEventListener('focus', (e) => renderDropdown(e.target.value.trim(), toDropdown, toInput));
  }

  document.addEventListener('click', (e) => {
    if (fromInput && fromDropdown && !fromInput.contains(e.target) && !fromDropdown.contains(e.target)) {
      fromDropdown.style.display = 'none';
    }
    if (toInput && toDropdown && !toInput.contains(e.target) && !toDropdown.contains(e.target)) {
      toDropdown.style.display = 'none';
    }
  });

  // Class Dropdown Logic
  const classTrigger = document.getElementById('class-trigger');
  const classDropdown = document.getElementById('class-dropdown');
  const classDisplay = document.getElementById('class-display');

  if (classTrigger && classDropdown && classDisplay) {
    classTrigger.addEventListener('click', (e) => {
      // Toggle dropdown visibility
      const isVisible = classDropdown.style.display === 'block';
      classDropdown.style.display = isVisible ? 'none' : 'block';
    });

    const classItems = classDropdown.querySelectorAll('.class-item');
    classItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent closing immediately from document click

        // Remove active class and hide check icon from all items
        classItems.forEach(i => {
          i.classList.remove('active');
          const check = i.querySelector('.check-icon');
          if (check) check.style.display = 'none';
        });

        // Add active class and show check icon for selected item
        item.classList.add('active');
        const check = item.querySelector('.check-icon');
        if (check) check.style.display = 'flex';

        // Update display text
        classDisplay.textContent = item.getAttribute('data-value');

        // Close dropdown
        classDropdown.style.display = 'none';
      });
    });

    document.addEventListener('click', (e) => {
      if (!classTrigger.contains(e.target)) {
        classDropdown.style.display = 'none';
      }
    });
  }

  // Friends Dropdown Logic
  const friendsDropdown = document.getElementById('friends-dropdown');
  if (addFriendsBtn && friendsDropdown) {
    addFriendsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = friendsDropdown.style.display === 'block';
      friendsDropdown.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!addFriendsBtn.contains(e.target) && !friendsDropdown.contains(e.target)) {
        friendsDropdown.style.display = 'none';
      }
    });
  }

  // Date Picker Logic
  const datesInputTrigger = document.getElementById('dates-input-trigger');
  const datePickerModal = document.getElementById('datepicker-modal');
  const datePickerPopup = document.getElementById('date-picker-popup');

  if (datesInputTrigger && datePickerModal) {
    datesInputTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      datePickerModal.style.display = 'flex';
    });

    // Close when clicking outside (on the overlay)
    datePickerModal.addEventListener('click', (e) => {
      if (e.target === datePickerModal) {
        datePickerModal.style.display = 'none';
      }
    });
  }

  // Sign In Modal Logic
  const signInBtn = document.querySelector('.sign-in');
  const signInModal = document.getElementById('signin-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const bookBtns = document.querySelectorAll('.book-btn-black');

  if (signInModal && modalCloseBtn) {
    if (signInBtn) {
      signInBtn.addEventListener('click', () => {
        signInModal.style.display = 'flex';
      });
    }

    bookBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        signInModal.style.display = 'flex';
      });
    });
    
    modalCloseBtn.addEventListener('click', () => {
      signInModal.style.display = 'none';
    });

    signInModal.addEventListener('click', (e) => {
      if (e.target === signInModal) {
        signInModal.style.display = 'none';
      }
    });
    
    // Boarding Pass Page Logic
    const modalContinueBtn = document.getElementById('modal-continue-btn');
    const modalGoogleBtn = document.getElementById('modal-google-btn');
    const modalAppleBtn = document.getElementById('modal-apple-btn');
    const boardingPassPage = document.getElementById('boarding-pass-page');
    const bpBackBtn = document.getElementById('bp-back-btn');
    
    // OTP Modal Logic
    const otpModal = document.getElementById('otp-modal');
    const otpCancelBtn = document.getElementById('otp-cancel-btn');
    const otpConfirmBtn = document.getElementById('otp-confirm-btn');

    function showOtpModal() {
      signInModal.style.display = 'none';
      if (otpModal) otpModal.style.display = 'flex';
    }

    if (modalContinueBtn) modalContinueBtn.addEventListener('click', showOtpModal);
    if (modalGoogleBtn) modalGoogleBtn.addEventListener('click', showOtpModal);
    if (modalAppleBtn) modalAppleBtn.addEventListener('click', showOtpModal);

    if (otpCancelBtn) {
      otpCancelBtn.addEventListener('click', () => {
        otpModal.style.display = 'none';
      });
    }

    if (otpConfirmBtn) {
      otpConfirmBtn.addEventListener('click', () => {
        otpModal.style.display = 'none';
        if (boardingPassPage) boardingPassPage.style.display = 'flex';
      });
    }

    if (otpModal) {
      otpModal.addEventListener('click', (e) => {
        if (e.target === otpModal) {
          otpModal.style.display = 'none';
        }
      });
    }

    if (bpBackBtn) {
      bpBackBtn.addEventListener('click', () => {
        boardingPassPage.style.display = 'none';
      });
    }
  }

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
