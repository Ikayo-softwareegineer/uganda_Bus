/**
 * UG Express - Concurrency Lab Controller
 * ------------------------------------
 * Safe frontend simulation of concurrent client requests.
 *
 * NOTE:
 * This version simulates client activity in the browser.
 * It does NOT make real bookings or modify the database.
 * The actual PHP concurrency test will be connected in the next phase.
 */

document.addEventListener('DOMContentLoaded', () => {
    const clientCountInput = document.getElementById('client-count');
    const experimentTypeSelect = document.getElementById('experiment-type');

    const startButton = document.getElementById('start-test');
    const resetButton = document.getElementById('reset-test');

    const totalClientsEl = document.getElementById('total-clients');
    const successfulEl = document.getElementById('successful-requests');
    const failedEl = document.getElementById('failed-requests');

    const resultsContainer = document.getElementById('client-results');
    const statusEl = document.getElementById('experiment-status');

    let running = false;

    // Initialize Lucide icons
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // --------------------------------------------------
    // Utility: Wait for a simulated processing duration
    // --------------------------------------------------
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --------------------------------------------------
    // Reset dashboard
    // --------------------------------------------------
    function resetDashboard() {
        totalClientsEl.textContent = '0';
        successfulEl.textContent = '0';
        failedEl.textContent = '0';

        resultsContainer.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    No experiment has been started.
                </td>
            </tr>
        `;

        statusEl.textContent = 'Ready to run an experiment.';
        statusEl.style.color = 'var(--text-muted)';
    }

    // --------------------------------------------------
    // Create client rows
    // --------------------------------------------------
    function createClientRows(count) {
        resultsContainer.innerHTML = '';

        for (let i = 1; i <= count; i++) {
            const row = document.createElement('tr');

            row.id = `client-row-${i}`;

            row.innerHTML = `
                <td style="padding:0.75rem;">Client ${i}</td>

                <td id="status-${i}" style="padding:0.75rem;">
                    Waiting
                </td>

                <td id="http-${i}" style="padding:0.75rem;">
                    —
                </td>

                <td id="duration-${i}" style="padding:0.75rem;">
                    —
                </td>

                <td id="result-${i}" style="padding:0.75rem;">
                    Pending
                </td>
            `;

            resultsContainer.appendChild(row);
        }
    }

    // --------------------------------------------------
    // Update a client row
    // --------------------------------------------------
    function updateClient(id, status, http, duration, result) {
        const statusEl = document.getElementById(`status-${id}`);
        const httpEl = document.getElementById(`http-${id}`);
        const durationEl = document.getElementById(`duration-${id}`);
        const resultEl = document.getElementById(`result-${id}`);

        if (statusEl) statusEl.textContent = status;
        if (httpEl) httpEl.textContent = http;
        if (durationEl) durationEl.textContent = duration;
        if (resultEl) resultEl.textContent = result;
    }

    // --------------------------------------------------
    // Simulate a concurrent client
    // --------------------------------------------------
    async function simulateClient(id, experimentType) {
        const startTime = performance.now();

        updateClient(id, 'Running', 'Pending', 'Processing...', 'Request sent');

        // All clients begin execution without waiting for previous clients.
        // This delay simulates processing time only.
        const processingTime = Math.floor(Math.random() * 2000) + 500;

        await delay(processingTime);

        const duration = Math.round(performance.now() - startTime);

        let httpCode;
        let result;

        if (experimentType === 'same-seat') {
            // Simulate contention for a shared resource.
            // Only one simulated client is allowed to succeed.
            if (id === 1) {
                httpCode = 200;
                result = 'Seat reservation granted (simulation)';
            } else {
                httpCode = 409;
                result = 'Seat already reserved (simulation)';
            }
        } else {
            // Independent requests have no shared-seat conflict.
            httpCode = 200;
            result = 'Request completed (simulation)';
        }

        updateClient(
            id,
            'Completed',
            httpCode,
            `${duration} ms`,
            result
        );

        return {
            id,
            httpCode,
            duration,
            success: httpCode === 200
        };
    }

    // --------------------------------------------------
    // Run experiment
    // --------------------------------------------------
    async function startExperiment() {
        if (running) return;

        const count = Number(clientCountInput.value);

        if (!Number.isInteger(count) || count < 2 || count > 50) {
            statusEl.textContent = 'Enter a number of clients between 2 and 50.';
            statusEl.style.color = '#dc2626';
            return;
        }

        running = true;

        startButton.disabled = true;
        resetButton.disabled = true;

        startButton.textContent = 'Experiment Running...';

        const experimentType = experimentTypeSelect.value;

        resetDashboard();
        createClientRows(count);

        totalClientsEl.textContent = count;
        statusEl.textContent = 'Launching clients concurrently (browser simulation)...';
        statusEl.style.color = '#2563eb';

        try {
            // Promise.all starts every simulated client without sequential waiting.
            const results = await Promise.all(
                Array.from({ length: count }, (_, index) =>
                    simulateClient(index + 1, experimentType)
                )
            );

            const successful = results.filter(r => r.success).length;
            const failed = results.length - successful;

            successfulEl.textContent = successful;
            failedEl.textContent = failed;

            statusEl.textContent =
                `Simulation completed: ${count} clients processed. ` +
                `${successful} successful and ${failed} rejected.`;

            statusEl.style.color = '#15803d';

        } catch (error) {
            console.error('Concurrency simulation error:', error);

            statusEl.textContent = 'Experiment encountered an error.';
            statusEl.style.color = '#dc2626';

        } finally {
            running = false;

            startButton.disabled = false;
            resetButton.disabled = false;

            startButton.textContent = 'Start Experiment';

            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
    }

    // --------------------------------------------------
    // Event listeners
    // --------------------------------------------------
    startButton.addEventListener('click', startExperiment);

    resetButton.addEventListener('click', () => {
        if (running) return;
        resetDashboard();
    });

    // Initial state
    resetDashboard();
});
