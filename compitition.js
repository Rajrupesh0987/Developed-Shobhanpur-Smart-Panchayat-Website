document.addEventListener('DOMContentLoaded', () => {
    // Select all the cards on the page
    const cards = document.querySelectorAll('.card');

    // Add a click event to each card
    cards.forEach(card => {
        card.addEventListener('click', () => {
            
            // Check if it is a 'Coming Soon' card
            if (card.classList.contains('disabled')) {
                alert('This section is coming soon! Stay tuned for updates.');
            } else {
                // If it's an active card, get its name and show a message
                const examName = card.getAttribute('data-name');
                alert(`Redirecting to the ${examName} portal...`);
                
                // Note: You can replace the alert above with an actual redirect like this:
                // window.location.href = 'bssc-10plus2.html';
            }
        });
    });
});