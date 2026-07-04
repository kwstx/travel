async function testTimeout() {
    try {
        const response = await fetch('http://localhost:3006/api/disruption/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pnr: 'TEST1234',
                userId: 'user_001',
                optionId: 'expired-option-789'
            })
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);
        console.log(`Response:`, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error during fetch:', e);
    }
}

testTimeout().catch(console.error);
